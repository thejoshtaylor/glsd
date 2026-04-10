import hashlib
import secrets
import uuid
from typing import Any

from sqlmodel import Session, select

from app.core.security import get_password_hash, verify_password
from app.models import (
    Item,
    ItemCreate,
    Node,
    SessionModel,
    User,
    UserCreate,
    UserUpdate,
)


def create_user(*, session: Session, user_create: UserCreate) -> User:
    db_obj = User.model_validate(
        user_create, update={"hashed_password": get_password_hash(user_create.password)}
    )
    session.add(db_obj)
    session.commit()
    session.refresh(db_obj)
    return db_obj


def update_user(*, session: Session, db_user: User, user_in: UserUpdate) -> Any:
    user_data = user_in.model_dump(exclude_unset=True)
    extra_data = {}
    if "password" in user_data:
        password = user_data["password"]
        hashed_password = get_password_hash(password)
        extra_data["hashed_password"] = hashed_password
    db_user.sqlmodel_update(user_data, update=extra_data)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(*, session: Session, email: str) -> User | None:
    statement = select(User).where(User.email == email)
    session_user = session.exec(statement).first()
    return session_user


# Dummy hash to use for timing attack prevention when user is not found
# This is an Argon2 hash of a random password, used to ensure constant-time comparison
DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$MjQyZWE1MzBjYjJlZTI0Yw$YTU4NGM5ZTZmYjE2NzZlZjY0ZWY3ZGRkY2U2OWFjNjk"


def authenticate(*, session: Session, email: str, password: str) -> User | None:
    db_user = get_user_by_email(session=session, email=email)
    if not db_user:
        # Prevent timing attacks by running password verification even when user doesn't exist
        # This ensures the response time is similar whether or not the email exists
        verify_password(password, DUMMY_HASH)
        return None
    verified, updated_password_hash = verify_password(password, db_user.hashed_password)
    if not verified:
        return None
    if updated_password_hash:
        db_user.hashed_password = updated_password_hash
        session.add(db_user)
        session.commit()
        session.refresh(db_user)
    return db_user


def create_item(*, session: Session, item_in: ItemCreate, owner_id: uuid.UUID) -> Item:
    db_item = Item.model_validate(item_in, update={"owner_id": owner_id})
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


# --- Node Pairing CRUD (D-01, D-02, D-04) ---


def _token_index(raw_token: str) -> str:
    """Fast non-secret index used only for DB lookup, not for auth.
    BLAKE2b of the raw token gives a constant-time-safe lookup key
    so verify_node_token avoids O(n) Argon2 scans."""
    return hashlib.blake2b(raw_token.encode(), digest_size=16).hexdigest()


def create_node_token(
    *, session: Session, user_id: uuid.UUID, name: str
) -> tuple[Node, str]:
    """Create a node with a hashed pairing token. Returns (node, raw_token).
    Per D-02: raw_token is shown once only."""
    raw_token = secrets.token_urlsafe(32)
    node = Node(
        name=name,
        user_id=user_id,
        token_hash=get_password_hash(raw_token),
        token_index=_token_index(raw_token),
        is_revoked=False,
    )
    session.add(node)
    session.commit()
    session.refresh(node)
    return node, raw_token


def verify_node_token(*, session: Session, token: str) -> Node | None:
    """Find a non-revoked node whose token matches the given raw token.
    Uses a BLAKE2b index for O(1) DB lookup, then verifies the full Argon2
    hash on the single matching row. Avoids timing-based enumeration."""
    idx = _token_index(token)
    node = session.exec(
        select(Node).where(Node.token_index == idx, Node.is_revoked == False)  # noqa: E712
    ).first()
    if not node:
        return None
    verified, updated_hash = verify_password(token, node.token_hash)
    if not verified:
        return None
    if updated_hash:
        node.token_hash = updated_hash
        session.add(node)
        session.commit()
        session.refresh(node)
    return node


def get_nodes_by_user(*, session: Session, user_id: uuid.UUID) -> list[Node]:
    statement = (
        select(Node)
        .where(Node.user_id == user_id)
        .order_by(Node.created_at.desc())  # type: ignore[union-attr]
    )
    return list(session.exec(statement).all())


def get_node_by_id(
    *, session: Session, node_id: uuid.UUID, user_id: uuid.UUID
) -> Node | None:
    """Return a node owned by user_id, or None if not found / not owned."""
    node = session.get(Node, node_id)
    if not node or node.user_id != user_id:
        return None
    return node


def revoke_node(
    *, session: Session, node_id: uuid.UUID, user_id: uuid.UUID
) -> Node | None:
    """Mark a node as revoked. Returns None if node not found or not owned by user.
    Per D-03: immediate revocation."""
    node = session.get(Node, node_id)
    if not node or node.user_id != user_id:
        return None
    node.is_revoked = True
    session.add(node)
    session.commit()
    session.refresh(node)
    return node


# --- Session CRUD (D-05, D-07) ---


def create_session(
    *, session: Session, user_id: uuid.UUID, node_id: uuid.UUID, cwd: str
) -> SessionModel | None:
    """Create a session record. Per D-05: REST-first creation.
    Returns None if node not found, not owned by user, or revoked."""
    node = session.get(Node, node_id)
    if not node or node.user_id != user_id or node.is_revoked:
        return None
    sess = SessionModel(
        user_id=user_id,
        node_id=node_id,
        cwd=cwd,
    )
    session.add(sess)
    session.commit()
    session.refresh(sess)
    return sess


def get_sessions_by_user(
    *, session: Session, user_id: uuid.UUID
) -> list[SessionModel]:
    statement = (
        select(SessionModel)
        .where(SessionModel.user_id == user_id)
        .order_by(SessionModel.created_at.desc())  # type: ignore[union-attr]
    )
    return list(session.exec(statement).all())


def get_session(
    *, session: Session, session_id: uuid.UUID
) -> SessionModel | None:
    return session.get(SessionModel, session_id)


def update_session_status(
    *, session: Session, session_id: uuid.UUID, status: str, **kwargs: Any
) -> SessionModel | None:
    sess = session.get(SessionModel, session_id)
    if not sess:
        return None
    sess.status = status
    for key, value in kwargs.items():
        if hasattr(sess, key):
            setattr(sess, key, value)
    session.add(sess)
    session.commit()
    session.refresh(sess)
    return sess
