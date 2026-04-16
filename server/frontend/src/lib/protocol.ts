// GLSD — TypeScript protocol types mirroring protocol-go/messages.go
// Field names MUST match Go struct json tags exactly (camelCase)
// See: node/protocol-go/messages.go and node/protocol-go/PROTOCOL.md

// ============================================================
// Browser -> Server messages
// ============================================================

export interface TaskMessage {
  type: 'task';
  taskId: string;
  sessionId: string;
  channelId: string;
  prompt: string;
  model: string;
  effort: string;
  permissionMode: string;
  personaSystemPrompt?: string;
  cwd: string;
  claudeSessionId?: string;
}

export interface StopMessage {
  type: 'stop';
  channelId: string;
  sessionId: string;
}

export interface PermissionResponseMessage {
  type: 'permissionResponse';
  channelId: string;
  sessionId: string;
  requestId: string;
  approved: boolean;
}

export interface QuestionResponseMessage {
  type: 'questionResponse';
  channelId: string;
  sessionId: string;
  requestId: string;
  answer: string;
}

export interface BrowseDirMessage {
  type: 'browseDir';
  requestId: string;
  channelId: string;
  machineId: string;
  path: string;
}

export interface ReadFileMessage {
  type: 'readFile';
  requestId: string;
  channelId: string;
  machineId: string;
  path: string;
  maxBytes?: number;
}

// ============================================================
// Server -> Browser messages
// ============================================================

export interface StreamMessage {
  type: 'stream';
  sessionId: string;
  channelId: string;
  sequenceNumber: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event: any;
}

export interface TaskStartedMessage {
  type: 'taskStarted';
  taskId: string;
  sessionId: string;
  channelId: string;
  startedAt: string;
}

export interface TaskCompleteMessage {
  type: 'taskComplete';
  taskId: string;
  sessionId: string;
  channelId: string;
  claudeSessionId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  durationMs: number;
  resultSummary?: string;
}

export interface TaskErrorMessage {
  type: 'taskError';
  taskId: string;
  sessionId: string;
  channelId: string;
  error: string;
}

export interface PermissionRequestMessage {
  type: 'permissionRequest';
  sessionId: string;
  channelId: string;
  requestId: string;
  toolName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolInput: any;
}

export interface QuestionMessage {
  type: 'question';
  sessionId: string;
  channelId: string;
  requestId: string;
  question: string;
  options?: string[];
}

export interface HeartbeatMessage {
  type: 'heartbeat';
  machineId: string;
  daemonVersion: string;
  status: string;
  timestamp: string;
}

export interface BrowseDirResultMessage {
  type: 'browseDirResult';
  requestId: string;
  channelId: string;
  ok: boolean;
  entries?: BrowseEntry[];
  error?: string;
}

export interface ReadFileResultMessage {
  type: 'readFileResult';
  requestId: string;
  channelId: string;
  ok: boolean;
  content?: string;
  truncated?: boolean;
  error?: string;
}

// ============================================================
// Connection handshake messages (daemon <-> server)
// ============================================================

export interface HelloMessage {
  type: 'hello';
  machineId: string;
  daemonVersion: string;
  os: string;
  arch: string;
  lastSequenceBySession: Record<string, number>;
}

export interface WelcomeMessage {
  type: 'welcome';
  ackedSequencesBySession: Record<string, number>;
}

export interface AckMessage {
  type: 'ack';
  sessionId: string;
  sequenceNumber: number;
}

export interface ReplayRequestMessage {
  type: 'replayRequest';
  sessionId: string;
  fromSequence: number;
}

export interface ReplayCompleteMessage {
  type: 'replayComplete';
  sessionId: string;
  lastSequence: number;
}

// ============================================================
// Supporting types
// ============================================================

export interface BrowseEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

// ============================================================
// gsd2Query / gsd2QueryResult — generic daemon command channel
// Browser sends gsd2Query; relay routes by machineId; daemon responds with gsd2QueryResult.
// machineId is consumed by the relay for routing and not forwarded to the daemon.
// ============================================================

export interface Gsd2QueryMessage {
  type: 'gsd2Query';
  requestId: string;
  channelId: string;
  machineId: string;
  command: string;
  params?: Record<string, unknown>;
}

export interface Gsd2QueryResultMessage {
  type: 'gsd2QueryResult';
  requestId: string;
  channelId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function isGsd2QueryResult(msg: unknown): msg is Gsd2QueryResultMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Gsd2QueryResultMessage).type === 'gsd2QueryResult'
  );
}

// ============================================================
// Discriminated union — all protocol messages
// ============================================================

export type ProtocolMessage =
  | TaskMessage
  | StopMessage
  | PermissionResponseMessage
  | QuestionResponseMessage
  | BrowseDirMessage
  | ReadFileMessage
  | Gsd2QueryMessage
  | StreamMessage
  | TaskStartedMessage
  | TaskCompleteMessage
  | TaskErrorMessage
  | PermissionRequestMessage
  | QuestionMessage
  | HeartbeatMessage
  | BrowseDirResultMessage
  | ReadFileResultMessage
  | Gsd2QueryResultMessage
  | HelloMessage
  | WelcomeMessage
  | AckMessage
  | ReplayRequestMessage
  | ReplayCompleteMessage;

// ============================================================
// Type guard helpers
// ============================================================

export function isStreamMessage(msg: ProtocolMessage): msg is StreamMessage {
  return msg.type === 'stream';
}

export function isTaskStarted(msg: ProtocolMessage): msg is TaskStartedMessage {
  return msg.type === 'taskStarted';
}

export function isTaskComplete(msg: ProtocolMessage): msg is TaskCompleteMessage {
  return msg.type === 'taskComplete';
}

export function isTaskError(msg: ProtocolMessage): msg is TaskErrorMessage {
  return msg.type === 'taskError';
}

export function isPermissionRequest(msg: ProtocolMessage): msg is PermissionRequestMessage {
  return msg.type === 'permissionRequest';
}

export function isQuestion(msg: ProtocolMessage): msg is QuestionMessage {
  return msg.type === 'question';
}

export function isHeartbeat(msg: ProtocolMessage): msg is HeartbeatMessage {
  return msg.type === 'heartbeat';
}

export function isBrowseDirResult(msg: ProtocolMessage): msg is BrowseDirResultMessage {
  return msg.type === 'browseDirResult';
}

export function isReadFileResult(msg: ProtocolMessage): msg is ReadFileResultMessage {
  return msg.type === 'readFileResult';
}

export function isReplayComplete(msg: ProtocolMessage): msg is ReplayCompleteMessage {
  return msg.type === 'replayComplete';
}
