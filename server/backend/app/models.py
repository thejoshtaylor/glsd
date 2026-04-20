import uuid
from datetime import datetime, timezone

from pydantic import EmailStr
from sqlalchemy import Column, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    email_verified: bool = Field(default=True)
    email_verification_token: str | None = Field(default=None, max_length=255)
    email_verification_sent_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    items: list["Item"] = Relationship(back_populates="owner", cascade_delete=True)


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Shared properties
class ItemBase(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=255)


# Properties to receive on item creation
class ItemCreate(ItemBase):
    pass


# Properties to receive on item update
class ItemUpdate(ItemBase):
    title: str | None = Field(default=None, min_length=1, max_length=255)  # type: ignore


# Database model, database table inferred from class name
class Item(ItemBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    owner_id: uuid.UUID = Field(
        foreign_key="user.id", nullable=False, ondelete="CASCADE"
    )
    owner: User | None = Relationship(back_populates="items")


# Properties to return via API, id is always required
class ItemPublic(ItemBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    created_at: datetime | None = None


class ItemsPublic(SQLModel):
    data: list[ItemPublic]
    count: int


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# --- Teams ---


class Team(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    name: str = Field(max_length=255)
    is_personal: bool = Field(default=False)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# --- Node Pairing (D-01, D-02, D-04) ---


class NodeBase(SQLModel):
    name: str = Field(max_length=255)


class Node(NodeBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    team_id: uuid.UUID = Field(foreign_key="team.id", nullable=False, index=True)
    status: str = Field(default="paired", max_length=50)
    machine_id: str | None = Field(default=None, max_length=255, unique=True, index=True)
    token_hash: str
    token_index: str = Field(max_length=64, index=True, unique=True)
    is_revoked: bool = Field(default=False)
    connected_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    disconnected_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    last_seen: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    os: str | None = Field(default=None, max_length=50)
    arch: str | None = Field(default=None, max_length=50)
    daemon_version: str | None = Field(default=None, max_length=50)
    default_code_dir: str | None = Field(default=None, max_length=1024)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    user: User | None = Relationship()
    sessions: list["SessionModel"] = Relationship(back_populates="node", cascade_delete=True)


class NodePublic(NodeBase):
    id: uuid.UUID
    status: str
    machine_id: str | None = None
    is_revoked: bool
    connected_at: datetime | None = None
    disconnected_at: datetime | None = None
    last_seen: datetime | None = None
    os: str | None = None
    arch: str | None = None
    daemon_version: str | None = None
    default_code_dir: str | None = None
    created_at: datetime | None = None


class NodePairResponse(SQLModel):
    node_id: uuid.UUID
    token: str  # raw token, shown once only (D-02)
    relay_url: str


class NodeCreateRequest(SQLModel):
    name: str = Field(min_length=1, max_length=255)


class NodeCodeRequest(SQLModel):
    name: str = Field(min_length=1, max_length=255)


class NodeCodeResponse(SQLModel):
    code: str


class NodeUpdateRequest(SQLModel):
    default_code_dir: str | None = Field(default=None, max_length=1024)


class DaemonPairRequest(SQLModel):
    code: str
    hostname: str
    os: str
    arch: str
    daemonVersion: str  # camelCase to match Go client


class DaemonPairResponse(SQLModel):
    machineId: str  # camelCase to match Go client
    authToken: str
    relayUrl: str


class NodesPublic(SQLModel):
    data: list[NodePublic]
    count: int


# --- Session (D-05) ---


class SessionBase(SQLModel):
    cwd: str = Field(max_length=4096)


class SessionModel(SessionBase, table=True):
    __tablename__ = "session"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    node_id: uuid.UUID = Field(foreign_key="node.id", nullable=False, index=True)
    project_id: uuid.UUID | None = Field(default=None, foreign_key="project.id", index=True)
    status: str = Field(default="created", max_length=50)
    claude_session_id: str | None = Field(default=None, max_length=255)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    started_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    completed_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    node: Node | None = Relationship(back_populates="sessions")
    events: list["SessionEvent"] = Relationship(back_populates="session", cascade_delete=True)


class SessionPublic(SQLModel):
    id: uuid.UUID
    user_id: uuid.UUID
    node_id: uuid.UUID
    project_id: uuid.UUID | None = None
    status: str
    cwd: str
    channel_id: str | None = None
    claude_session_id: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class SessionCreateRequest(SQLModel):
    node_id: uuid.UUID
    cwd: str = Field(min_length=1, max_length=4096)
    project_id: uuid.UUID | None = None


class SessionsPublic(SQLModel):
    data: list[SessionPublic]
    count: int


# --- Projects (D-08) ---


class ProjectBase(SQLModel):
    name: str = Field(max_length=255)
    node_id: uuid.UUID = Field(foreign_key="node.id")
    cwd: str = Field(max_length=4096)


class Project(ProjectBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class ProjectPublic(ProjectBase):
    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime | None = None


class ProjectCreateRequest(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    node_id: uuid.UUID
    cwd: str = Field(min_length=1, max_length=4096)


class ProjectsPublic(SQLModel):
    data: list[ProjectPublic]
    count: int


class ProjectGitConfig(SQLModel, table=True):
    __tablename__ = "project_git_config"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", unique=True, index=True)
    repo_url: str = Field(max_length=2048)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# --- Session Events (D-08, D-09) ---


class SessionEvent(SQLModel, table=True):
    __tablename__ = "session_event"
    session_id: uuid.UUID = Field(foreign_key="session.id", nullable=False, primary_key=True)
    sequence_number: int = Field(primary_key=True)
    event_type: str = Field(max_length=50, index=True)
    payload: dict = Field(sa_column=Column(JSONB))
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    session: SessionModel | None = Relationship(back_populates="events")


# --- Usage Tracking (T-12-04) ---


class UsageRecord(SQLModel, table=True):
    __tablename__ = "usage_record"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    session_id: uuid.UUID = Field(foreign_key="session.id", nullable=False, index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    cost_usd: float = Field(default=0.0)
    duration_ms: int = Field(default=0)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),
    )


# --- Push Subscriptions (NOTF-01, NOTF-02) ---


class PushSubscription(SQLModel, table=True):
    __tablename__ = "push_subscription"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    endpoint: str = Field(max_length=2048)
    p256dh: str = Field(max_length=512)
    auth: str = Field(max_length=512)
    notify_permissions: bool = Field(default=True)
    notify_completions: bool = Field(default=True)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class PushSubscribeRequest(SQLModel):
    endpoint: str = Field(max_length=2048)
    p256dh: str = Field(max_length=512)
    auth: str = Field(max_length=512)


class PushPreferencesUpdate(SQLModel):
    notify_permissions: bool | None = None
    notify_completions: bool | None = None


class PushPermissionResponse(SQLModel):
    session_id: str
    request_id: str
    approved: bool


# --- Handoff Pairs (S02) ---


class HandoffPair(SQLModel, table=True):
    __tablename__ = "handoffpair"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    node_a_id: uuid.UUID = Field(foreign_key="node.id", nullable=False)
    node_b_id: uuid.UUID = Field(foreign_key="node.id", nullable=False)
    schedule: str = Field(max_length=50)
    branch_prefix: str = Field(default="glsd/handoff", max_length=255)
    active_node_id: uuid.UUID | None = Field(default=None, foreign_key="node.id")
    last_handoff_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    last_branch_ref: str | None = Field(default=None, max_length=255)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# --- User Settings (D-03, D-04) ---


class UserSettings(SQLModel, table=True):
    __tablename__ = "user_settings"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, unique=True, index=True)
    theme: str = Field(default="system", max_length=50)
    accent_color: str = Field(default="default", max_length=50)
    ui_density: str = Field(default="normal", max_length=20)
    font_size_scale: str = Field(default="medium", max_length=20)
    font_family: str = Field(default="default", max_length=100)
    notifications_enabled: bool = Field(default=True)
    notify_on_complete: bool = Field(default=True)
    notify_on_error: bool = Field(default=True)
    notify_cost_threshold: float | None = Field(default=None)
    notify_on_phase_complete: bool = Field(default=True)
    notify_on_cost_warning: bool = Field(default=True)
    default_cost_limit: float = Field(default=0.0)
    debug_logging: bool = Field(default=False)
    user_mode: str = Field(default="expert", max_length=20)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class UserSettingsUpdate(SQLModel):
    theme: str | None = None
    accent_color: str | None = None
    ui_density: str | None = None
    font_size_scale: str | None = None
    font_family: str | None = None
    notifications_enabled: bool | None = None
    notify_on_complete: bool | None = None
    notify_on_error: bool | None = None
    notify_cost_threshold: float | None = None
    notify_on_phase_complete: bool | None = None
    notify_on_cost_warning: bool | None = None
    default_cost_limit: float | None = None
    debug_logging: bool | None = None
    user_mode: str | None = None


# --- GitHub App Installation ---


class GitHubAppInstallation(SQLModel, table=True):
    __tablename__ = "github_app_installation"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    installation_id: int = Field(unique=True, index=True)
    account_login: str = Field(max_length=255)
    account_type: str = Field(max_length=50)
    app_id: int
    encrypted_token: str
    token_expires_at: datetime = Field(sa_type=DateTime(timezone=True))
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", index=True)


class GitHubInstallationPublic(SQLModel):
    id: uuid.UUID
    installation_id: int
    account_login: str
    account_type: str
    app_id: int
    token_expires_at: datetime
    created_at: datetime | None = None
    user_id: uuid.UUID | None = None


# --- Triggers ---


class Trigger(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    project_id: uuid.UUID = Field(foreign_key="project.id", index=True)
    name: str = Field(max_length=255)
    event_type: str = Field(max_length=50)
    conditions: dict | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    enabled: bool = Field(default=True)
    cooldown_seconds: int = Field(default=0)
    last_fired_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class TriggerCreate(SQLModel):
    name: str = Field(max_length=255)
    event_type: str = Field(max_length=50)
    conditions: dict | None = None
    enabled: bool = True
    cooldown_seconds: int = 0


class TriggerUpdate(SQLModel):
    name: str | None = None
    event_type: str | None = None
    conditions: dict | None = None
    enabled: bool | None = None
    cooldown_seconds: int | None = None


class TriggerPublic(SQLModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    event_type: str
    conditions: dict | None = None
    enabled: bool
    cooldown_seconds: int
    last_fired_at: datetime | None = None
    created_at: datetime | None = None


class TriggersPublic(SQLModel):
    data: list[TriggerPublic]
    count: int


# --- Action Chains ---


class ActionChain(SQLModel, table=True):
    __tablename__ = "actionchain"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    trigger_id: uuid.UUID = Field(foreign_key="trigger.id", index=True)
    name: str = Field(max_length=255)
    display_order: int = Field(default=0)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class ActionChainCreate(SQLModel):
    name: str = Field(max_length=255)
    display_order: int = 0


class ActionChainPublic(SQLModel):
    id: uuid.UUID
    trigger_id: uuid.UUID
    name: str
    display_order: int
    created_at: datetime | None = None


class ActionChainsPublic(SQLModel):
    data: list[ActionChainPublic]
    count: int


# --- Actions ---


class Action(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    chain_id: uuid.UUID = Field(foreign_key="actionchain.id", index=True)
    action_type: str = Field(max_length=50)
    config: dict | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    sequence_order: int = Field(default=0)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class ActionCreate(SQLModel):
    action_type: str = Field(max_length=50)
    config: dict | None = None
    sequence_order: int = 0


class ActionPublic(SQLModel):
    id: uuid.UUID
    chain_id: uuid.UUID
    action_type: str
    config: dict | None = None
    sequence_order: int
    created_at: datetime | None = None


class ActionsPublic(SQLModel):
    data: list[ActionPublic]
    count: int


# --- Trigger Executions ---


class TriggerExecution(SQLModel, table=True):
    __tablename__ = "trigger_execution"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    trigger_id: uuid.UUID = Field(foreign_key="trigger.id", index=True)
    fired_at: datetime = Field(sa_type=DateTime(timezone=True))
    status: str = Field(default="PENDING", max_length=20)
    chain_results: dict | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    event_payload: dict | None = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class TriggerExecutionPublic(SQLModel):
    id: uuid.UUID
    trigger_id: uuid.UUID
    fired_at: datetime
    status: str
    chain_results: dict | None = None
    event_payload: dict | None = None
    created_at: datetime | None = None


class TriggerExecutionsPublic(SQLModel):
    data: list[TriggerExecutionPublic]
    count: int
