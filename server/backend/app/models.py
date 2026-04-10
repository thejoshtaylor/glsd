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


# --- Node Pairing (D-01, D-02, D-04) ---


class NodeBase(SQLModel):
    name: str = Field(max_length=255)


class Node(NodeBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False, index=True)
    machine_id: str | None = Field(default=None, max_length=255, unique=True, index=True)
    token_hash: str
    is_revoked: bool = Field(default=False)
    connected_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    disconnected_at: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    last_seen: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    os: str | None = Field(default=None, max_length=50)
    arch: str | None = Field(default=None, max_length=50)
    daemon_version: str | None = Field(default=None, max_length=50)
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    user: User | None = Relationship()
    sessions: list["SessionModel"] = Relationship(back_populates="node", cascade_delete=True)


class NodePublic(NodeBase):
    id: uuid.UUID
    machine_id: str | None = None
    is_revoked: bool
    connected_at: datetime | None = None
    disconnected_at: datetime | None = None
    last_seen: datetime | None = None
    os: str | None = None
    arch: str | None = None
    daemon_version: str | None = None
    created_at: datetime | None = None


class NodePairResponse(SQLModel):
    node_id: uuid.UUID
    token: str  # raw token, shown once only (D-02)
    relay_url: str


class NodeCreateRequest(SQLModel):
    name: str = Field(min_length=1, max_length=255)


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
    status: str
    cwd: str
    claude_session_id: str | None = None
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class SessionCreateRequest(SQLModel):
    node_id: uuid.UUID
    cwd: str = Field(min_length=1, max_length=4096)


class SessionsPublic(SQLModel):
    data: list[SessionPublic]
    count: int


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
