// GSD Cloud - Push notification subscription and permission management hook
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useState, useEffect, useCallback } from "react";

interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  notifyPermissions: boolean;
  notifyCompletions: boolean;
  loading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: "unsupported",
    subscribed: false,
    notifyPermissions: true,
    notifyCompletions: true,
    loading: true,
    error: null,
  });

  // Check initial state
  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!supported) {
      setState((s) => ({ ...s, supported: false, loading: false }));
      return;
    }

    const permission = Notification.permission;

    // Check if already subscribed
    navigator.serviceWorker.ready
      .then((reg) => {
        return reg.pushManager.getSubscription();
      })
      .then((sub) => {
        const subscribed = sub !== null;
        // Fetch preferences from server if subscribed
        if (subscribed) {
          fetch("/api/v1/push/subscriptions", { credentials: "include" })
            .then((r) => r.json())
            .then((data) => {
              const first = data.subscriptions?.[0];
              setState((s) => ({
                ...s,
                supported: true,
                permission,
                subscribed: true,
                notifyPermissions: first?.notify_permissions ?? true,
                notifyCompletions: first?.notify_completions ?? true,
                loading: false,
              }));
            })
            .catch(() => {
              setState((s) => ({
                ...s,
                supported: true,
                permission,
                subscribed: true,
                loading: false,
              }));
            });
        } else {
          setState((s) => ({
            ...s,
            supported: true,
            permission,
            subscribed: false,
            loading: false,
          }));
        }
      })
      .catch(() => {
        setState((s) => ({ ...s, supported: true, permission, loading: false }));
      });
  }, []);

  // D-10: Subscribe -- triggers Notification.requestPermission()
  const subscribe = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState((s) => ({
          ...s,
          permission,
          subscribed: false,
          loading: false,
          error:
            permission === "denied"
              ? "Notifications blocked. Enable in browser settings."
              : null,
        }));
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      const vapidKeyResp = await fetch("/api/v1/push/vapid-key", {
        credentials: "include",
      });
      const vapidKey = await vapidKeyResp.text();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      });

      const subJson = sub.toJSON();
      await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh ?? "",
          auth: subJson.keys?.auth ?? "",
        }),
      });

      setState((s) => ({
        ...s,
        permission: "granted",
        subscribed: true,
        loading: false,
      }));
      return true;
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Subscription failed",
      }));
      return false;
    }
  }, []);

  // Unsubscribe
  const unsubscribe = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }
      await fetch("/api/v1/push/subscribe", {
        method: "DELETE",
        credentials: "include",
      });
      setState((s) => ({ ...s, subscribed: false, loading: false }));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  // D-11: Update per-type preferences
  const updatePreferences = useCallback(
    async (prefs: {
      notify_permissions?: boolean;
      notify_completions?: boolean;
    }) => {
      try {
        await fetch("/api/v1/push/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(prefs),
        });
        setState((s) => ({
          ...s,
          notifyPermissions: prefs.notify_permissions ?? s.notifyPermissions,
          notifyCompletions: prefs.notify_completions ?? s.notifyCompletions,
        }));
      } catch {
        // Silently fail -- preferences will sync on next load
      }
    },
    []
  );

  return { ...state, subscribe, unsubscribe, updatePreferences };
}
