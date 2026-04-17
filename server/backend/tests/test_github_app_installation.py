"""Round-trip tests for GitHubAppInstallation model and Fernet encryption."""
import pytest
from datetime import datetime, timezone, timedelta

from cryptography.fernet import Fernet, InvalidToken
from sqlmodel import Session

from app.core.encryption import decrypt_token, encrypt_token
from app.models import GitHubAppInstallation


def test_github_app_installation_token_round_trip(db: Session) -> None:
    key = Fernet.generate_key().decode()
    plaintext = "ghs_syntheticInstallationToken12345"
    encrypted = encrypt_token(plaintext, key)

    record = GitHubAppInstallation(
        installation_id=12345678,
        account_login="test-org",
        account_type="Organization",
        app_id=999,
        encrypted_token=encrypted,
        token_expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Stored value must be ciphertext, not plaintext
    assert record.encrypted_token != plaintext
    assert plaintext not in record.encrypted_token

    # Decrypt must recover plaintext
    decrypted = decrypt_token(record.encrypted_token, key)
    assert decrypted == plaintext

    # Cleanup
    db.delete(record)
    db.commit()


def test_decrypt_with_wrong_key_raises() -> None:
    key1 = Fernet.generate_key().decode()
    key2 = Fernet.generate_key().decode()
    encrypted = encrypt_token("secret", key1)
    with pytest.raises((InvalidToken, Exception)):
        decrypt_token(encrypted, key2)
