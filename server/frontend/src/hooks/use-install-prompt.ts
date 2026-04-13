// GSD Cloud - PWA install prompt interception hook
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { useState, useEffect, useCallback } from "react";

const DISMISSED_KEY = "gsd-install-dismissed";

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // D-06: Show once, dismissal stored in localStorage
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptEvent = deferredPrompt as any;
    promptEvent.prompt();
    await promptEvent.userChoice;
    setDeferredPrompt(null);
    setShowBanner(false);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShowBanner(false);
  }, []);

  return { showBanner, install, dismiss };
}
