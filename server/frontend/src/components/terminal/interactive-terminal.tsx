// GSD Cloud — Interactive Terminal Component
// xterm.js terminal that streams Claude Code output via WebSocket relay
// Replaces Tauri PTY with useCloudSession hook

import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { useCloudSession } from "@/hooks/use-cloud-session";
import { PermissionPrompt } from "./permission-prompt";
import { QuestionPrompt } from "./question-prompt";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TerminalSearchBar } from "./terminal-search-bar";
import { BroadcastIndicator } from "./broadcast-indicator";
import { ReconnectionBanner } from "@/components/session/reconnection-banner";

// Module-level caches: persist terminal instances across unmount/remount cycles.
// Keyed by persistKey (nodeId:tabId). Entries are cleaned up when tabs are closed.

/** Cached xterm Terminal with addons, kept alive across page navigations */
interface CachedTerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  serializeAddon: SerializeAddon;
  onDataDisposable: { dispose: () => void };
  lineHeight: number;
}

const terminalInstanceCache = new Map<string, CachedTerminalInstance>();

// Indirection maps: allow updating React ref targets without re-registering xterm handlers.
const terminalKeyHandlers = new Map<string, (e: KeyboardEvent) => boolean>();

/** Clean up all caches for a terminal (call when a tab is permanently closed) */
export function clearTerminalCache(key: string) {
  const cached = terminalInstanceCache.get(key);
  if (cached) {
    cached.onDataDisposable.dispose();
    cached.terminal.dispose();
    terminalInstanceCache.delete(key);
  }
  terminalKeyHandlers.delete(key);
}

export interface InteractiveTerminalRef {
  /** Focus the terminal */
  focus: () => void;
  /** Clear the terminal display */
  clear: () => void;
  /** Get the current session ID */
  getSessionId: () => string | null;
  /** Check if connected */
  isConnected: () => boolean;
  /** Reconnect / restart session */
  reconnect: () => Promise<void>;
}

export interface InteractiveTerminalProps {
  /** Stable key for buffer persistence across unmount/remount (e.g., "nodeId:tabId") */
  persistKey?: string;
  /** Node ID to create a session on */
  nodeId?: string | null;
  /** Working directory for the Claude Code session */
  workingDirectory: string;
  /** Callback when a new session is created (with session ID) */
  onSessionCreated?: (sessionId: string) => void;
  /** Callback when terminal is ready */
  onReady?: () => void;
  /** Callback when terminal errors */
  onError?: (error: string) => void;
  /** Additional CSS classes */
  className?: string;
  /** Font size in pixels (default: 14) */
  fontSize?: number;
  /** Line height multiplier (default: 1.2) */
  lineHeight?: number;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Whether this terminal is currently the active/visible tab */
  visible?: boolean;
  /** Whether this terminal is in broadcast mode */
  isBroadcasting?: boolean;
  /** Callback to write to all broadcast terminals */
  onBroadcastWrite?: (data: string) => void;
  /** Suppress keyboard input (read-only terminal) */
  readOnly?: boolean;
}

/**
 * Interactive terminal component streaming Claude Code output via WebSocket.
 *
 * Features:
 * - Real-time output streaming from remote Claude Code sessions
 * - Inline PermissionPrompt and QuestionPrompt overlays
 * - ANSI color support via xterm.js
 * - Terminal resize handling
 * - Cached terminal instances across page navigations
 */
export const InteractiveTerminal = forwardRef<InteractiveTerminalRef, InteractiveTerminalProps>(
  function InteractiveTerminal(
    {
      persistKey,
      nodeId,
      workingDirectory,
      onSessionCreated,
      onReady,
      onError,
      className,
      fontSize = 14,
      lineHeight = 1.2,
      autoConnect = true,
      visible = true,
      isBroadcasting = false,
      onBroadcastWrite,
      readOnly = false,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);
    const hasConnectedRef = useRef(false);
    // Capture persistKey in a ref so the cleanup closure always has the latest value
    const persistKeyRef = useRef(persistKey);
    persistKeyRef.current = persistKey;
    const [showSearch, setShowSearch] = useState(false);

    // SH-05: Broadcast write ref (null when not broadcasting)
    const broadcastWriteRef = useRef<((data: string) => void) | null>(null);

    // Cloud session hook — replaces usePtySession
    const { state, createSession, sendStop, respondPermission, respondQuestion, disconnect } = useCloudSession({
      onData: useCallback((text: string) => {
        if (terminalRef.current) {
          terminalRef.current.write(text);
        }
      }, []),
      onTaskError: useCallback((error: string) => {
        if (terminalRef.current) {
          terminalRef.current.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n`);
        }
        onError?.(error);
      }, [onError]),
      onError: useCallback((error: string) => {
        if (terminalRef.current) {
          terminalRef.current.write(`\r\n\x1b[31mConnection error: ${error}\x1b[0m\r\n`);
        }
        onError?.(error);
      }, [onError]),
    });

    // SH-05: Update broadcast ref based on props
    useEffect(() => {
      broadcastWriteRef.current = isBroadcasting && onBroadcastWrite ? onBroadcastWrite : null;
    }, [isBroadcasting, onBroadcastWrite]);

    // Connect to a cloud session
    const connectToCloud = useCallback(async () => {
      if (!nodeId || !workingDirectory) return;

      try {
        const sessionId = await createSession(nodeId, workingDirectory);
        onSessionCreated?.(sessionId);
        onReady?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (terminalRef.current) {
          terminalRef.current.write(`\r\n\x1b[31mFailed to connect: ${message}\x1b[0m\r\n`);
        }
        onError?.(message);
      }
    }, [nodeId, workingDirectory, createSession, onSessionCreated, onReady, onError]);

    // Reconnect handler (user-initiated restart)
    const reconnect = useCallback(async () => {
      if (terminalRef.current) {
        terminalRef.current.reset();
        terminalRef.current.clear();
      }
      disconnect();
      await connectToCloud();
    }, [connectToCloud, disconnect]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => terminalRef.current?.focus(),
      clear: () => {
        terminalRef.current?.reset();
        terminalRef.current?.clear();
      },
      getSessionId: () => state.sessionId,
      isConnected: () => state.isConnected,
      reconnect,
    }), [state.sessionId, state.isConnected, reconnect]);

    // Initialize terminal (or restore from cache)
    useEffect(() => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const key = persistKeyRef.current;
      let terminal: Terminal;
      let fitAddon: FitAddon;
      let searchAddon: SearchAddon;
      let serializeAddon: SerializeAddon;
      let isRestoredFromCache = false;

      // Path A: Restore cached terminal instance (persisted across page navigations)
      const cached = key ? terminalInstanceCache.get(key) : undefined;
      if (cached && cached.lineHeight === lineHeight) {
        terminal = cached.terminal;
        fitAddon = cached.fitAddon;
        searchAddon = cached.searchAddon;
        serializeAddon = cached.serializeAddon;
        isRestoredFromCache = true;

        // Move the cached terminal's DOM element into the new container
        if (terminal.element) {
          container.appendChild(terminal.element);
        }

        // Fit to new container dimensions and refresh display
        requestAnimationFrame(() => {
          fitAddon.fit();
          terminal.refresh(0, terminal.rows - 1);
        });
      } else {
        // If cached terminal has mismatched lineHeight, dispose it first
        if (cached && key) {
          cached.onDataDisposable.dispose();
          cached.terminal.dispose();
          terminalInstanceCache.delete(key);
          terminalKeyHandlers.delete(key);
        }

        // Path B: Create new terminal
        terminal = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          theme: {
            background: "#0a0a0a",
            foreground: "#fafafa",
            cursor: "#fafafa",
            cursorAccent: "#0a0a0a",
            selectionBackground: "#3b3b3b",
            selectionForeground: "#fafafa",
            black: "#000000",
            red: "#ff5555",
            green: "#50fa7b",
            yellow: "#f1fa8c",
            blue: "#6272a4",
            magenta: "#ff79c6",
            cyan: "#8be9fd",
            white: "#f8f8f2",
            brightBlack: "#6272a4",
            brightRed: "#ff6e6e",
            brightGreen: "#69ff94",
            brightYellow: "#ffffa5",
            brightBlue: "#d6acff",
            brightMagenta: "#ff92df",
            brightCyan: "#a4ffff",
            brightWhite: "#ffffff",
          },
          fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
          fontSize,
          lineHeight,
          scrollback: 10000,
          convertEol: true,
          allowProposedApi: true,
        });

        fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        searchAddon = new SearchAddon();
        serializeAddon = new SerializeAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);
        terminal.loadAddon(searchAddon);
        terminal.loadAddon(serializeAddon);
        terminal.open(container);

        // Register key handler through indirection (once per Terminal lifetime)
        terminal.attachCustomKeyEventHandler((e) => {
          if (key) {
            const handler = terminalKeyHandlers.get(key);
            if (handler) return handler(e);
          }
          // Default: intercept Cmd/Ctrl+F for search
          if ((e.metaKey || e.ctrlKey) && e.key === 'f' && e.type === 'keydown') {
            return false;
          }
          return true;
        });

        // Terminal is output-only for cloud sessions — no raw input to remote
        // (user interacts via sendTask, PermissionPrompt, QuestionPrompt)
        const onDataDisposable = terminal.onData(() => {
          // In broadcast mode, forward to broadcast handler
          if (!readOnly && broadcastWriteRef.current) {
            // Broadcast is local terminal coordination — no-op for cloud sessions
          }
        });
        onDataDisposableRef.current = onDataDisposable;

        // Initial fit after short delay
        requestAnimationFrame(() => {
          fitAddon.fit();
        });

        // Store in instance cache for future remounts
        if (key) {
          terminalInstanceCache.set(key, {
            terminal,
            fitAddon,
            searchAddon,
            serializeAddon,
            onDataDisposable,
            lineHeight,
          });
        }
      }

      // Both paths: Update indirection maps with current React refs
      if (key) {
        terminalKeyHandlers.set(key, (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'f' && e.type === 'keydown') {
            setShowSearch(true);
            return false;
          }
          if (readOnly) return false;
          return true;
        });
      }

      // Store refs for component access
      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      searchAddonRef.current = searchAddon;

      // ResizeObserver for responsive fit
      let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
      const resizeObserver = new ResizeObserver((entries) => {
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        const entry = entries[0];
        if (!entry || entry.contentRect.width === 0 || entry.contentRect.height === 0) {
          return;
        }
        resizeTimeout = setTimeout(() => {
          fitAddon.fit();
        }, 150);
      });
      resizeObserver.observe(container);

      // IntersectionObserver to refit when container becomes visible
      const intersectionObserver = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          fitAddon.fit();
          terminal.refresh(0, terminal.rows - 1);
        }
      });
      intersectionObserver.observe(container);

      // Auto-connect if enabled and nodeId is available
      let autoConnectTimer: ReturnType<typeof setTimeout> | null = null;
      let cancelled = false;
      if (autoConnect && nodeId && !hasConnectedRef.current) {
        hasConnectedRef.current = true;
        autoConnectTimer = setTimeout(() => {
          if (!cancelled) {
            void connectToCloud();
          }
        }, isRestoredFromCache ? 50 : 100);
      }

      // Cleanup
      return () => {
        cancelled = true;
        if (autoConnectTimer) {
          clearTimeout(autoConnectTimer);
        }
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        resizeObserver.disconnect();
        intersectionObserver.disconnect();

        onDataDisposableRef.current?.dispose();
        onDataDisposableRef.current = null;

        if (persistKeyRef.current && terminalInstanceCache.has(persistKeyRef.current)) {
          // Cached terminal: detach DOM element but keep Terminal alive
          if (terminal.element) {
            terminal.element.remove();
          }
        } else {
          // No persistKey: dispose terminal
          terminal.dispose();
        }

        terminalRef.current = null;
        fitAddonRef.current = null;
        searchAddonRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lineHeight]); // Only re-init on lineHeight change

    // Dynamically update font size without re-initializing the terminal
    useEffect(() => {
      if (terminalRef.current && fitAddonRef.current) {
        terminalRef.current.options.fontSize = fontSize;
        fitAddonRef.current.fit();
      }
    }, [fontSize]);

    // Force repaint when terminal becomes the active/visible tab
    useEffect(() => {
      if (visible && terminalRef.current && fitAddonRef.current) {
        fitAddonRef.current.fit();
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      }
    }, [visible]);

    return (
      <div className={cn("relative h-full w-full overflow-hidden flex flex-col", className)}>
        {/* Reconnection banner — shown when re-connecting after an established session (not during initial connect) */}
        <ReconnectionBanner
          visible={
            (state.connectionState === 'connecting' || state.connectionState === 'replaying')
            && state.sessionId !== null
          }
        />

        {/* Search bar overlay */}
        <TerminalSearchBar
          searchAddon={searchAddonRef.current}
          visible={showSearch}
          onClose={() => setShowSearch(false)}
        />

        {/* Terminal container */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 bg-[#0a0a0a] rounded-lg overflow-hidden xterm-container"
        />

        {/* Broadcast indicator */}
        {isBroadcasting && <BroadcastIndicator />}

        {/* Inline permission prompt */}
        {state.pendingPermission && (
          <PermissionPrompt
            request={state.pendingPermission}
            onRespond={(approved) =>
              respondPermission(state.pendingPermission!.requestId, approved)
            }
          />
        )}

        {/* Inline question prompt */}
        {state.pendingQuestion && (
          <QuestionPrompt
            question={state.pendingQuestion}
            onAnswer={(answer) =>
              respondQuestion(state.pendingQuestion!.requestId, answer)
            }
          />
        )}

        {/* Loading overlay */}
        {state.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 rounded-lg">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span>Connecting...</span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {state.error && !state.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/80 rounded-lg">
            <div className="flex flex-col items-center gap-3 text-center p-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <span className="text-destructive text-sm">{state.error}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reconnect()}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Stop button — shown when task is running */}
        {state.isConnected && !state.isLoading && (
          <div className="absolute bottom-2 right-2">
            <Button
              variant="outline"
              size="sm"
              onClick={sendStop}
              className="gap-2 bg-background/80"
            >
              Stop
            </Button>
          </div>
        )}
      </div>
    );
  }
);

// Re-export sendTask and sendStop types via the ref API if needed externally
export default InteractiveTerminal;
