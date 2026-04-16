# GSD Cloud Wire Protocol

Version: 1
Transport: WebSocket (text frames, JSON payloads)

This document is the **authoritative source** for the GSD Cloud relay protocol.
Both the Go bindings in this repository and any TypeScript bindings must match
this contract exactly.

## Envelope

Every message is a JSON object with a `type` field:

```json
{ "type": "<name>", ...fields }
```

## Browser → Daemon messages

### `task`
Dispatch a user message to a session.

| Field | Type | Notes |
|---|---|---|
| type | "task" | |
| taskId | uuid | |
| sessionId | uuid | |
| channelId | string | Routes stream events back to the correct browser tab |
| prompt | string | |
| model | string | e.g. `claude-opus-4-6[1m]` |
| effort | "low" \| "medium" \| "high" \| "max" | |
| permissionMode | string | e.g. `acceptEdits` |
| personaSystemPrompt | string? | Injected via `--append-system-prompt` |
| cwd | string | Absolute path on the daemon's machine |
| claudeSessionId | string? | Pass to `claude -p --resume` to continue an existing Claude conversation. Empty for the first turn. |

### `stop`
Interrupt the current Claude process for a session.

| Field | Type |
|---|---|
| type | "stop" |
| channelId | string |
| sessionId | uuid |

### `permissionResponse`

| Field | Type |
|---|---|
| type | "permissionResponse" |
| channelId | string |
| sessionId | uuid |
| requestId | uuid |
| approved | boolean |

### `questionResponse`

| Field | Type |
|---|---|
| type | "questionResponse" |
| channelId | string |
| sessionId | uuid |
| requestId | uuid |
| answer | string |

### `browseDir`

| Field | Type |
|---|---|
| type | "browseDir" |
| requestId | uuid |
| channelId | string |
| machineId | uuid |
| path | string |

### `readFile`

| Field | Type |
|---|---|
| type | "readFile" |
| requestId | uuid |
| channelId | string |
| machineId | uuid |
| path | string |
| maxBytes | int? | Defaults to 512 KiB |

## Daemon → Browser messages

### `stream`
High-frequency Claude event. The `event` field is an opaque JSON object passed through from Claude's stream-json output.

| Field | Type |
|---|---|
| type | "stream" |
| sessionId | uuid |
| channelId | string |
| sequenceNumber | int64 |
| event | object |

### `taskStarted`

| Field | Type |
|---|---|
| type | "taskStarted" |
| taskId | uuid |
| sessionId | uuid |
| channelId | string |
| startedAt | iso8601 string |

### `taskComplete`

| Field | Type |
|---|---|
| type | "taskComplete" |
| taskId | uuid |
| sessionId | uuid |
| channelId | string |
| claudeSessionId | string |
| inputTokens | int64 |
| outputTokens | int64 |
| costUsd | string | Decimal string to avoid float precision loss |
| durationMs | int |
| resultSummary | string? |

### `taskError`

| Field | Type |
|---|---|
| type | "taskError" |
| taskId | uuid |
| sessionId | uuid |
| channelId | string |
| error | string |

### `permissionRequest`

| Field | Type |
|---|---|
| type | "permissionRequest" |
| sessionId | uuid |
| channelId | string |
| requestId | uuid |
| toolName | string |
| toolInput | object |

### `question`

| Field | Type |
|---|---|
| type | "question" |
| sessionId | uuid |
| channelId | string |
| requestId | uuid |
| question | string |
| options | string[]? |

### `heartbeat`

| Field | Type |
|---|---|
| type | "heartbeat" |
| machineId | uuid |
| daemonVersion | string |
| status | "online" |
| timestamp | iso8601 string |

### `browseDirResult`

| Field | Type |
|---|---|
| type | "browseDirResult" |
| requestId | uuid |
| channelId | string |
| ok | boolean |
| entries | []BrowseEntry? |
| error | string? |

`BrowseEntry`:
```json
{ "name": "...", "path": "...", "isDirectory": bool, "size": int, "modifiedAt": "iso8601" }
```

### `readFileResult`

| Field | Type |
|---|---|
| type | "readFileResult" |
| requestId | uuid |
| channelId | string |
| ok | boolean |
| content | string? |
| truncated | boolean? |
| error | string? |

### `gsd2Query` (browser → daemon)
Generic command-dispatch query. Used for health checks, session listing, and other RPC-style requests that don't require a full task session.

| Field | Type | Notes |
|---|---|---|
| type | "gsd2Query" | |
| requestId | uuid | Correlates with gsd2QueryResult |
| channelId | string | |
| machineId | uuid | Target machine |
| command | string | e.g. `health` |
| params | object? | Command-specific parameters |

### `gsd2QueryResult` (daemon → browser)
Response to a `gsd2Query`.

| Field | Type | Notes |
|---|---|---|
| type | "gsd2QueryResult" | |
| requestId | uuid | Matches the originating gsd2Query |
| channelId | string | |
| ok | boolean | `true` on success |
| data | object? | Command-specific response payload |
| error | string? | Present when `ok` is false |

## Daemon ↔ Relay control messages

### `hello` (daemon → relay, first frame after connect)

| Field | Type |
|---|---|
| type | "hello" |
| machineId | uuid |
| daemonVersion | string |
| os | string |
| arch | string |
| lastSequenceBySession | map<uuid, int64> | Highest sequence the daemon has in local WAL per session |

### `welcome` (relay → daemon, response to hello)

| Field | Type |
|---|---|
| type | "welcome" |
| ackedSequencesBySession | map<uuid, int64> | Highest sequence persisted to Supabase per session |

### `ack` (relay → daemon)

| Field | Type |
|---|---|
| type | "ack" |
| sessionId | uuid |
| sequenceNumber | int64 |

Daemon may prune WAL entries ≤ `sequenceNumber` for this session.

### `replayRequest` (relay → daemon)

| Field | Type |
|---|---|
| type | "replayRequest" |
| sessionId | uuid |
| fromSequence | int64 |

Daemon replays all WAL entries with sequence > fromSequence for this session.

## Handoff messages

These messages coordinate a session handoff from Node A to Node B via a shared git branch.

### `handoffReady` (Node A → server)

Sent when Node A has committed and pushed the handoff branch.

| Field | Type | Description |
|---|---|---|
| type | "handoffReady" | |
| pairId | string | Unique handoff pair identifier |
| machineId | string | Node A's machine ID |
| branchRef | string | Git branch, e.g. `gsd/handoff/<pairId>` |
| commitSha | string | HEAD commit SHA of the handoff branch |
| daemonVersion | string | Daemon version on Node A |

### `handoffSignal` (server → Node B)

Sent by the server to Node B to trigger a git pull and session resume.

| Field | Type | Description |
|---|---|---|
| type | "handoffSignal" | |
| pairId | string | Unique handoff pair identifier |
| branchRef | string | Git branch to pull |
| commitSha | string | Expected commit SHA after pull |
| sessionId | string (optional) | `claudeSessionId` to pass to `--resume` |

### `handoffAck` (Node B → server)

Sent by Node B after it has successfully pulled and resumed (or failed).

| Field | Type | Description |
|---|---|---|
| type | "handoffAck" | |
| pairId | string | Unique handoff pair identifier |
| machineId | string | Node B's machine ID |
| branchRef | string | Git branch that was pulled |
| ok | bool | `true` if pull and resume succeeded |
| error | string (optional) | Error message if `ok` is false |
