// GLSD -- Deploy Node Modal behavioral tests (UX-01c)

import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/test-utils";
import { DeployNodeModal } from "../deploy-node-modal";

const mockMutateAsync = vi.fn().mockResolvedValue({ code: "ABC123" });

vi.mock("@/lib/queries", () => ({
  useNodes: () => ({ data: { data: [], count: 0 } }),
  useGeneratePairingCode: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useUpdateNode: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({
    copyToClipboard: vi.fn(),
    copiedItems: new Map(),
    copied: false,
    error: null,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("DeployNodeModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders name input and Generate Code button when open", () => {
    const user = userEvent.setup();
    void user; // userEvent setup for future interactions
    render(<DeployNodeModal open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText(/node name/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate code/i })
    ).toBeInTheDocument();
  });

  it("calls generatePairingCode mutation on form submit", async () => {
    const user = userEvent.setup();
    render(<DeployNodeModal open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/node name/i), "test-node");
    await user.click(screen.getByRole("button", { name: /generate code/i }));

    expect(mockMutateAsync).toHaveBeenCalledWith("test-node");
  });

  it("displays pairing code after generation", async () => {
    const user = userEvent.setup();
    render(<DeployNodeModal open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/node name/i), "test-node");
    await user.click(screen.getByRole("button", { name: /generate code/i }));

    await waitFor(() => {
      expect(screen.getByText("ABC123")).toBeInTheDocument();
    });
  });

  it("renders OS tabs (macOS, Linux, Windows)", async () => {
    const user = userEvent.setup();
    render(<DeployNodeModal open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/node name/i), "test-node");
    await user.click(screen.getByRole("button", { name: /generate code/i }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /macos/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /linux/i })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: /windows/i })
      ).toBeInTheDocument();
    });
  });

  it("shows install commands with window.location.origin", async () => {
    const user = userEvent.setup();
    render(<DeployNodeModal open={true} onOpenChange={vi.fn()} />);

    await user.type(screen.getByLabelText(/node name/i), "test-node");
    await user.click(screen.getByRole("button", { name: /generate code/i }));

    await waitFor(() => {
      const content = document.body.textContent ?? "";
      expect(content).toContain("curl -fsSL");
      expect(content).toContain("glsd login ABC123");
      expect(content).toContain("glsd start");
    });
  });

  it("does not render modal content when closed", () => {
    const user = userEvent.setup();
    void user;
    render(<DeployNodeModal open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByLabelText(/node name/i)).toBeNull();
  });
});
