// GLSD — WebSocket client with cookie auth and reconnection
// Cookie auth (D-04): no token in URL — relies on httpOnly cookie
// T-04-02: Authentication handled server-side via cookie JWT

import type { ProtocolMessage } from '../protocol';

type MessageHandler = (msg: ProtocolMessage) => void;

export class GsdWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private lastSeq = 0;
  private sessionId: string | null = null;
  private connectionStateHandlers: Set<(state: 'disconnected' | 'connecting' | 'connected') => void> = new Set();

  connect(channelId: string): void {
    this.closed = false;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/browser?channelId=${encodeURIComponent(channelId)}`;
    this.ws = new WebSocket(url);
    this.emitConnectionState('connecting');

    this.ws.onopen = () => {
      const wasReconnect = this.reconnectAttempts > 0;
      this.reconnectAttempts = 0;
      this.emitConnectionState('connected');

      // D-01: Send replayRequest on reconnect if we have a session and lastSeq
      if (wasReconnect && this.sessionId && this.lastSeq > 0) {
        this.send({
          type: 'replayRequest',
          sessionId: this.sessionId,
          fromSequence: this.lastSeq,
        });
      }
    };

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(event.data) as ProtocolMessage;
        const type = (msg as { type?: string }).type;
        if (type) {
          const typeHandlers = this.handlers.get(type);
          if (typeHandlers) {
            typeHandlers.forEach((handler) => handler(msg));
          }
        }
      } catch {
        // ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      if (!this.closed) {
        this.emitConnectionState('disconnected');
        this.scheduleReconnect(channelId);
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, which triggers reconnect
    };
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  send(msg: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** Update the highest-seen sequence number. Called by the hook on every sequenced message. */
  updateLastSeq(seq: number): void {
    if (seq > this.lastSeq) {
      this.lastSeq = seq;
    }
  }

  /** Set the session ID used for replayRequest on reconnect. */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /** Subscribe to connection state changes. Returns unsubscribe function. */
  onConnectionState(handler: (state: 'disconnected' | 'connecting' | 'connected') => void): () => void {
    this.connectionStateHandlers.add(handler);
    return () => { this.connectionStateHandlers.delete(handler); };
  }

  private emitConnectionState(state: 'disconnected' | 'connecting' | 'connected'): void {
    this.connectionStateHandlers.forEach(h => h(state));
  }

  disconnect(): void {
    this.closed = true;
    this.lastSeq = 0;
    this.sessionId = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.handlers.clear();
    this.connectionStateHandlers.clear();
  }

  private scheduleReconnect(channelId: string): void {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) {
        this.connect(channelId);
      }
    }, delay);
  }
}
