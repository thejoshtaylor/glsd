// GLSD - Settings page push notification tests
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme/theme-provider";

// Mock matchMedia for jsdom (required by ThemeProvider)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Default mock return value -- unsubscribed state
const defaultPushState = {
  supported: true,
  permission: "default" as NotificationPermission,
  subscribed: false,
  notifyPermissions: true,
  notifyCompletions: true,
  loading: false,
  error: null,
  subscribe: vi.fn().mockResolvedValue(true),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  updatePreferences: vi.fn().mockResolvedValue(undefined),
};

// Mutable ref so individual tests can override
let mockPushReturn = { ...defaultPushState };

vi.mock("@/hooks/use-push-notifications", () => ({
  usePushNotifications: () => mockPushReturn,
}));

// Mock useSettings and related hooks to avoid real API calls
vi.mock("@/lib/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queries")>();
  const noopMutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  const noopQuery = () => ({ data: undefined, isLoading: false });
  return {
    ...actual,
    useSettings: () => ({
      data: {
        user_mode: "expert",
        theme: "dark",
        start_on_login: false,
        auto_open_last_project: false,
        window_state: "normal",
        use_tmux: false,
        notifications_enabled: true,
        notify_on_complete: true,
        notify_on_error: true,
        notify_on_phase_complete: false,
        debug_logging: false,
      },
      isLoading: false,
    }),
    useUpdateSettings: noopMutation,
    useResetSettings: noopMutation,
    useImportSettings: noopMutation,
    useExportData: noopMutation,
    useClearAllData: noopMutation,
    useClearSelectedData: noopMutation,
    useSecrets: noopQuery,
    useAddSecret: noopMutation,
    useDeleteSecret: noopMutation,
  };
});

// Lazy import so the mocks are in place before module evaluation
const { SettingsPage } = await import("./settings");

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Click the Notifications tab using userEvent for Radix compatibility */
async function openNotificationsTab(): Promise<HTMLElement> {
  const user = userEvent.setup();
  const tab = screen.getByRole("tab", { name: /notifications/i });
  await user.click(tab);
  // Radix tabs use role="tabpanel" for active content
  const panels = screen.getAllByRole("tabpanel");
  // Return the visible (non-hidden) panel
  return panels.find((p) => !p.hidden) ?? panels[0];
}

describe("Settings - Push Notifications", () => {
  beforeEach(() => {
    mockPushReturn = { ...defaultPushState };
  });

  it("renders the Push Notifications heading in the Notifications tab", async () => {
    renderSettings();
    const panel = await openNotificationsTab();
    expect(within(panel).getByText("Push Notifications")).toBeTruthy();
  });

  it("master toggle is unchecked when not subscribed", async () => {
    mockPushReturn = { ...defaultPushState, subscribed: false };
    renderSettings();
    await openNotificationsTab();
    const masterToggle = document.getElementById("settings-push-master") as HTMLButtonElement;
    expect(masterToggle).toBeTruthy();
    expect(masterToggle.getAttribute("aria-checked")).toBe("false");
  });

  it("sub-toggles are disabled when master toggle is off (subscribed=false)", async () => {
    mockPushReturn = { ...defaultPushState, subscribed: false };
    renderSettings();
    await openNotificationsTab();
    const permToggle = document.getElementById("settings-push-permissions") as HTMLButtonElement;
    const compToggle = document.getElementById("settings-push-completions") as HTMLButtonElement;
    expect(permToggle).toBeTruthy();
    expect(compToggle).toBeTruthy();
    expect(
      permToggle.hasAttribute("disabled") ||
        permToggle.getAttribute("data-disabled") !== null
    ).toBe(true);
    expect(
      compToggle.hasAttribute("disabled") ||
        compToggle.getAttribute("data-disabled") !== null
    ).toBe(true);
  });

  it("sub-toggles are enabled when subscribed=true", async () => {
    mockPushReturn = { ...defaultPushState, subscribed: true, permission: "granted" };
    renderSettings();
    await openNotificationsTab();
    const permToggle = document.getElementById("settings-push-permissions") as HTMLButtonElement;
    const compToggle = document.getElementById("settings-push-completions") as HTMLButtonElement;
    expect(permToggle).toBeTruthy();
    expect(compToggle).toBeTruthy();
    // When subscribed and not loading, sub-toggles should NOT be disabled
    expect(permToggle.hasAttribute("disabled")).toBe(false);
    expect(compToggle.hasAttribute("disabled")).toBe(false);
  });
});
