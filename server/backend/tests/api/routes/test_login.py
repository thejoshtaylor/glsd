from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from pwdlib.hashers.bcrypt import BcryptHasher
from sqlmodel import Session

from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.crud import create_user
from app.models import User, UserCreate
from app.utils import (
    generate_email_verification_token,
    generate_password_reset_token,
    verify_email_verification_token,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def test_get_access_token(client: TestClient) -> None:
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    assert r.status_code == 200
    assert "access_token" in tokens
    assert tokens["access_token"]


def test_get_access_token_incorrect_password(client: TestClient) -> None:
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": "incorrect",
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    assert r.status_code == 400


def test_use_access_token(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.post(
        f"{settings.API_V1_STR}/login/test-token",
        headers=superuser_token_headers,
    )
    result = r.json()
    assert r.status_code == 200
    assert "email" in result


def test_recovery_password(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    with (
        patch("app.core.config.settings.SMTP_HOST", "smtp.example.com"),
        patch("app.core.config.settings.SMTP_USER", "admin@example.com"),
    ):
        email = "test@example.com"
        r = client.post(
            f"{settings.API_V1_STR}/password-recovery/{email}",
            headers=normal_user_token_headers,
        )
        assert r.status_code == 200
        assert r.json() == {
            "message": "If that email is registered, we sent a password recovery link"
        }


def test_recovery_password_user_not_exits(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    email = "jVgQr@example.com"
    r = client.post(
        f"{settings.API_V1_STR}/password-recovery/{email}",
        headers=normal_user_token_headers,
    )
    # Should return 200 with generic message to prevent email enumeration attacks
    assert r.status_code == 200
    assert r.json() == {
        "message": "If that email is registered, we sent a password recovery link"
    }


def test_reset_password(client: TestClient, db: Session) -> None:
    email = random_email()
    password = random_lower_string()
    new_password = random_lower_string()

    user_create = UserCreate(
        email=email,
        full_name="Test User",
        password=password,
        is_active=True,
        is_superuser=False,
    )
    user = create_user(session=db, user_create=user_create)
    token = generate_password_reset_token(email=email)
    headers = user_authentication_headers(client=client, email=email, password=password)
    data = {"new_password": new_password, "token": token}

    r = client.post(
        f"{settings.API_V1_STR}/reset-password/",
        headers=headers,
        json=data,
    )

    assert r.status_code == 200
    assert r.json() == {"message": "Password updated successfully"}

    db.refresh(user)
    verified, _ = verify_password(new_password, user.hashed_password)
    assert verified


def test_reset_password_invalid_token(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"new_password": "changethis", "token": "invalid"}
    r = client.post(
        f"{settings.API_V1_STR}/reset-password/",
        headers=superuser_token_headers,
        json=data,
    )
    response = r.json()

    assert "detail" in response
    assert r.status_code == 400
    assert response["detail"] == "Invalid token"


def test_login_with_bcrypt_password_upgrades_to_argon2(
    client: TestClient, db: Session
) -> None:
    """Test that logging in with a bcrypt password hash upgrades it to argon2."""
    email = random_email()
    password = random_lower_string()

    # Create a bcrypt hash directly (simulating legacy password)
    bcrypt_hasher = BcryptHasher()
    bcrypt_hash = bcrypt_hasher.hash(password)
    assert bcrypt_hash.startswith("$2")  # bcrypt hashes start with $2

    user = User(email=email, hashed_password=bcrypt_hash, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)

    assert user.hashed_password.startswith("$2")

    login_data = {"username": email, "password": password}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    assert r.status_code == 200
    tokens = r.json()
    assert "access_token" in tokens

    db.refresh(user)

    # Verify the hash was upgraded to argon2
    assert user.hashed_password.startswith("$argon2")

    verified, updated_hash = verify_password(password, user.hashed_password)
    assert verified
    # Should not need another update since it's already argon2
    assert updated_hash is None


# --- Email Verification Tests ---


def test_generate_and_verify_email_verification_token() -> None:
    """Test token generation with purpose claim and round-trip verification."""
    email = "test@example.com"
    token = generate_email_verification_token(email)
    assert isinstance(token, str)
    assert len(token) > 0
    result = verify_email_verification_token(token)
    assert result == email


def test_verify_email_verification_token_rejects_reset_token() -> None:
    """Ensure password reset tokens cannot be used for email verification (purpose mismatch)."""
    token = generate_password_reset_token("test@example.com")
    result = verify_email_verification_token(token)
    assert result is None


def test_verify_email_valid_token(client: TestClient, db: Session) -> None:
    """POST /verify-email with valid token verifies the user."""
    email = random_email()
    password = random_lower_string()
    user_create = UserCreate(email=email, password=password)
    user = create_user(session=db, user_create=user_create)
    user.email_verified = False
    db.add(user)
    db.commit()

    token = generate_email_verification_token(email)
    r = client.post(f"{settings.API_V1_STR}/verify-email", params={"token": token})
    assert r.status_code == 200
    assert r.json()["message"] == "Email verified successfully"

    db.refresh(user)
    assert user.email_verified is True


def test_verify_email_invalid_token(client: TestClient) -> None:
    """POST /verify-email with garbage token returns 400."""
    r = client.post(f"{settings.API_V1_STR}/verify-email", params={"token": "garbage"})
    assert r.status_code == 400


def test_verify_email_already_verified(client: TestClient, db: Session) -> None:
    """POST /verify-email for already verified user returns 200 with 'already verified'."""
    email = random_email()
    password = random_lower_string()
    user_create = UserCreate(email=email, password=password)
    user = create_user(session=db, user_create=user_create)
    # User is verified by default (email_verified=True)

    token = generate_email_verification_token(email)
    r = client.post(f"{settings.API_V1_STR}/verify-email", params={"token": token})
    assert r.status_code == 200
    assert r.json()["message"] == "Email already verified"


def test_resend_verification_rate_limit(client: TestClient, db: Session) -> None:
    """POST /resend-verification within 60s of last send returns 429."""
    email = random_email()
    password = random_lower_string()
    user_create = UserCreate(email=email, password=password)
    user = create_user(session=db, user_create=user_create)
    user.email_verified = False
    user.email_verification_sent_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()

    headers = user_authentication_headers(client=client, email=email, password=password)
    r = client.post(f"{settings.API_V1_STR}/resend-verification", headers=headers)
    assert r.status_code == 429


def test_resend_verification_success(client: TestClient, db: Session) -> None:
    """POST /resend-verification when not rate limited returns 200."""
    email = random_email()
    password = random_lower_string()
    user_create = UserCreate(email=email, password=password)
    user = create_user(session=db, user_create=user_create)
    user.email_verified = False
    user.email_verification_sent_at = None
    db.add(user)
    db.commit()

    headers = user_authentication_headers(client=client, email=email, password=password)
    r = client.post(f"{settings.API_V1_STR}/resend-verification", headers=headers)
    assert r.status_code == 200
    assert r.json()["message"] == "If your email needs verification, we sent a new link"


def test_login_with_argon2_password_keeps_hash(client: TestClient, db: Session) -> None:
    """Test that logging in with an argon2 password hash does not update it."""
    email = random_email()
    password = random_lower_string()

    # Create an argon2 hash (current default)
    argon2_hash = get_password_hash(password)
    assert argon2_hash.startswith("$argon2")

    # Create user with argon2 hash
    user = User(email=email, hashed_password=argon2_hash, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)

    original_hash = user.hashed_password

    login_data = {"username": email, "password": password}
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    assert r.status_code == 200
    tokens = r.json()
    assert "access_token" in tokens

    db.refresh(user)

    assert user.hashed_password == original_hash
    assert user.hashed_password.startswith("$argon2")
