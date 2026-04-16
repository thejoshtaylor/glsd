"""Pydantic models for the GLSD WebSocket protocol.

Field names match the JSON wire format defined in node/protocol-go/messages.go.
Use camelCase aliases via Field(alias=...) since the wire format is camelCase.
"""
from __future__ import annotations

import typing

from pydantic import BaseModel, Field


class HelloMessage(BaseModel):
    type: typing.Literal["hello"]
    machine_id: str = Field(alias="machineId")
    daemon_version: str = Field(alias="daemonVersion")
    os: str
    arch: str
    last_sequence_by_session: dict[str, int] = Field(
        default_factory=dict, alias="lastSequenceBySession"
    )
    model_config = {"populate_by_name": True}


class WelcomeMessage(BaseModel):
    type: typing.Literal["welcome"] = "welcome"
    acked_sequences_by_session: dict[str, int] = Field(
        default_factory=dict, alias="ackedSequencesBySession"
    )
    model_config = {"populate_by_name": True}


class AckMessage(BaseModel):
    type: typing.Literal["ack"] = "ack"
    session_id: str = Field(alias="sessionId")
    sequence_number: int = Field(alias="sequenceNumber")
    model_config = {"populate_by_name": True}


class TaskMessage(BaseModel):
    type: typing.Literal["task"]
    task_id: str = Field(alias="taskId")
    session_id: str = Field(alias="sessionId")
    channel_id: str = Field(alias="channelId")
    prompt: str
    model: str
    effort: str
    permission_mode: str = Field(alias="permissionMode")
    persona_system_prompt: str = Field(default="", alias="personaSystemPrompt")
    cwd: str
    claude_session_id: str = Field(default="", alias="claudeSessionId")
    model_config = {"populate_by_name": True}


class StopMessage(BaseModel):
    type: typing.Literal["stop"]
    channel_id: str = Field(alias="channelId")
    session_id: str = Field(alias="sessionId")
    model_config = {"populate_by_name": True}


class StreamMessage(BaseModel):
    type: typing.Literal["stream"]
    session_id: str = Field(alias="sessionId")
    channel_id: str = Field(alias="channelId")
    sequence_number: int = Field(alias="sequenceNumber")
    event: dict | list | str = Field(default={})
    model_config = {"populate_by_name": True}


class HeartbeatMessage(BaseModel):
    type: typing.Literal["heartbeat"]
    machine_id: str = Field(alias="machineId")
    daemon_version: str = Field(alias="daemonVersion")
    status: str
    timestamp: str
    model_config = {"populate_by_name": True}


class TaskStartedMessage(BaseModel):
    type: typing.Literal["taskStarted"]
    task_id: str = Field(alias="taskId")
    session_id: str = Field(alias="sessionId")
    channel_id: str = Field(alias="channelId")
    started_at: str = Field(alias="startedAt")
    model_config = {"populate_by_name": True}


class TaskCompleteMessage(BaseModel):
    type: typing.Literal["taskComplete"]
    task_id: str = Field(alias="taskId")
    session_id: str = Field(alias="sessionId")
    channel_id: str = Field(alias="channelId")
    claude_session_id: str = Field(alias="claudeSessionId")
    input_tokens: int = Field(alias="inputTokens")
    output_tokens: int = Field(alias="outputTokens")
    cost_usd: str = Field(alias="costUsd")
    duration_ms: int = Field(alias="durationMs")
    result_summary: str = Field(default="", alias="resultSummary")
    model_config = {"populate_by_name": True}


class TaskErrorMessage(BaseModel):
    type: typing.Literal["taskError"]
    task_id: str = Field(alias="taskId")
    session_id: str = Field(alias="sessionId")
    channel_id: str = Field(alias="channelId")
    error: str
    model_config = {"populate_by_name": True}


class PermissionRequestMessage(BaseModel):
    type: typing.Literal["permissionRequest"]
    session_id: str = Field(alias="sessionId")
    channel_id: str = Field(alias="channelId")
    request_id: str = Field(alias="requestId")
    tool_name: str = Field(alias="toolName")
    tool_input: dict | list | str = Field(default={}, alias="toolInput")
    model_config = {"populate_by_name": True}


class QuestionMessage(BaseModel):
    type: typing.Literal["question"]
    session_id: str = Field(alias="sessionId")
    channel_id: str = Field(alias="channelId")
    request_id: str = Field(alias="requestId")
    question: str
    options: list[str] = Field(default_factory=list)
    model_config = {"populate_by_name": True}


class PermissionResponseMessage(BaseModel):
    type: typing.Literal["permissionResponse"]
    channel_id: str = Field(alias="channelId")
    session_id: str = Field(alias="sessionId")
    request_id: str = Field(alias="requestId")
    approved: bool
    model_config = {"populate_by_name": True}


class QuestionResponseMessage(BaseModel):
    type: typing.Literal["questionResponse"]
    channel_id: str = Field(alias="channelId")
    session_id: str = Field(alias="sessionId")
    request_id: str = Field(alias="requestId")
    answer: str
    model_config = {"populate_by_name": True}


# Discriminated union for incoming node messages
NodeMessage = (
    HelloMessage
    | StreamMessage
    | HeartbeatMessage
    | TaskStartedMessage
    | TaskCompleteMessage
    | TaskErrorMessage
    | PermissionRequestMessage
    | QuestionMessage
)

# Discriminated union for incoming browser messages
BrowserMessage = (
    TaskMessage | StopMessage | PermissionResponseMessage | QuestionResponseMessage
)
