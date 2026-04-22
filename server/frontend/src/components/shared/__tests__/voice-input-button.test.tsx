// GLSD — VoiceInputButton tests

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/test-utils";
import { VoiceInputButton } from "../voice-input-button";

// Per KNOWLEDGE.md: vi.spyOn on ESM named exports fails — mock at module level
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/lib/api/transcribe", () => ({
  transcribeBlob: vi.fn(),
}));

// MediaRecorder is not available in jsdom — provide a minimal class mock.
// vitest 4 requires a real class (not an arrow function) when stubbing a constructor.
let fakeRecorderInstance: FakeMediaRecorder;

class FakeMediaRecorder {
  static isTypeSupported = vi.fn().mockReturnValue(true);
  start = vi.fn();
  stop = vi.fn();
  private listeners: Record<string, Array<(arg?: unknown) => void>> = {};

  constructor() {
    // Capture the instance so tests can trigger events on it
    fakeRecorderInstance = this;
  }

  addEventListener(event: string, handler: (arg?: unknown) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  emit(event: string, arg?: unknown) {
    (this.listeners[event] ?? []).forEach((h) => h(arg));
  }
}

beforeEach(() => {
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

  // Default: getUserMedia grants permission
  Object.defineProperty(navigator, "mediaDevices", {
    writable: true,
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({} as MediaStream),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VoiceInputButton", () => {
  it("renders mic button in idle state", () => {
    render(<VoiceInputButton onTranscribed={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /start voice input/i })
    ).toBeInTheDocument();
  });

  it("shows spinner during transcription", async () => {
    const { transcribeBlob } = await import("@/lib/api/transcribe");

    let resolveTranscribe!: (v: { text: string }) => void;
    vi.mocked(transcribeBlob).mockReturnValue(
      new Promise((res) => {
        resolveTranscribe = res;
      })
    );

    const user = userEvent.setup();
    render(<VoiceInputButton onTranscribed={vi.fn()} />);

    // Start recording
    await user.click(screen.getByRole("button", { name: /start voice input/i }));

    // Should now show stop recording button
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /stop recording/i })
      ).toBeInTheDocument();
    });

    // Stop recording — triggers transcription
    await user.click(screen.getByRole("button", { name: /stop recording/i }));

    // Emit stop event so the promise in stopAndTranscribe resolves
    fakeRecorderInstance.emit("stop");

    await waitFor(() => {
      expect(
        document.querySelector('[aria-label="Transcribing"]')
      ).toBeInTheDocument();
    });

    // Resolve to clean up
    resolveTranscribe({ text: "hello" });
  });

  it("calls onTranscribed with returned text on success", async () => {
    const { transcribeBlob } = await import("@/lib/api/transcribe");
    vi.mocked(transcribeBlob).mockResolvedValue({ text: "hello world" });

    const onTranscribed = vi.fn();
    const user = userEvent.setup();
    render(<VoiceInputButton onTranscribed={onTranscribed} />);

    await user.click(screen.getByRole("button", { name: /start voice input/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /stop recording/i })
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /stop recording/i }));
    fakeRecorderInstance.emit("stop");

    await waitFor(() => {
      expect(onTranscribed).toHaveBeenCalledWith("hello world");
    });
  });

  it("shows tooltip error when mic permission is denied", async () => {
    const deniedError = Object.assign(new Error("Permission denied"), {
      name: "NotAllowedError",
    });
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(deniedError);

    const user = userEvent.setup();
    render(<VoiceInputButton onTranscribed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /start voice input/i }));

    await waitFor(() => {
      // The tooltip role element contains the accessible text
      expect(
        screen.getByRole("tooltip", { name: /microphone access denied/i })
      ).toBeInTheDocument();
    });
  });

  it("calls toast.error on transcribe failure", async () => {
    const { transcribeBlob } = await import("@/lib/api/transcribe");
    vi.mocked(transcribeBlob).mockRejectedValue(new Error("server error"));

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<VoiceInputButton onTranscribed={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /start voice input/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /stop recording/i })
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /stop recording/i }));
    fakeRecorderInstance.emit("stop");

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Transcription failed");
    });
  });
});
