// GLSD — VoiceInputButton: microphone button that records audio and calls onTranscribed with text.
// Self-contained: owns its own TooltipProvider for the permission-denied tooltip branch.

import { useState, useRef, useCallback } from "react";
import { Mic, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { transcribeBlob } from "@/lib/api/transcribe";

type RecordingState = "idle" | "recording" | "transcribing";

interface VoiceInputButtonProps {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}

const MAX_RECORDING_MS = 60_000;

export function VoiceInputButton({
  onTranscribed,
  disabled,
}: VoiceInputButtonProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAndTranscribe = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    mediaRecorderRef.current = null;

    setState("transcribing");
    const start = Date.now();

    try {
      const result = await transcribeBlob(blob);
      const durationMs = Date.now() - start;
      console.log(`[VoiceInputButton] transcribeBlob success duration_ms=${durationMs}`);
      onTranscribed(result.text);
    } catch (err) {
      const errorType = err instanceof Error ? err.name : String(err);
      console.error(`[VoiceInputButton] transcribeBlob error type=${errorType}`, err);
      toast.error("Transcription failed");
    } finally {
      setState("idle");
    }
  }, [onTranscribed]);

  const handleClick = useCallback(async () => {
    if (state === "recording") {
      await stopAndTranscribe();
      return;
    }

    if (state === "transcribing") return;

    // Start recording
    setPermissionDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      });

      recorder.start();
      setState("recording");

      // Auto-stop after MAX_RECORDING_MS
      timeoutRef.current = setTimeout(() => {
        void stopAndTranscribe();
      }, MAX_RECORDING_MS);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        console.error("[VoiceInputButton] MediaRecorder unavailable: mic permission denied");
        setPermissionDenied(true);
      } else {
        console.error("[VoiceInputButton] MediaRecorder unavailable:", err);
        toast.error("Microphone unavailable");
      }
    }
  }, [state, stopAndTranscribe]);

  const buttonContent = () => {
    if (state === "transcribing") {
      return <Loader2 className="h-4 w-4 animate-spin" aria-label="Transcribing" />;
    }
    if (state === "recording") {
      return (
        <>
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          <span className="text-xs">Recording…</span>
        </>
      );
    }
    return <Mic className="h-4 w-4" />;
  };

  const button = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled || state === "transcribing"}
      onClick={() => void handleClick()}
      aria-label={state === "recording" ? "Stop recording" : "Start voice input"}
      className={state === "recording" ? "gap-1.5" : ""}
    >
      {buttonContent()}
    </Button>
  );

  if (permissionDenied) {
    return (
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>Microphone access denied</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
