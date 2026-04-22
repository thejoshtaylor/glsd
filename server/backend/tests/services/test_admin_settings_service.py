"""Unit tests for admin_settings service (Fernet round-trip, error paths)."""

import pytest
from cryptography.fernet import InvalidToken
from sqlmodel import Session

from app.models import AdminSetting
from app.services import admin_settings as svc


def test_set_and_get_round_trip(db: Session) -> None:
    svc.set_setting(db, "test_key_rt", "secret_value_123")
    result = svc.get_setting(db, "test_key_rt")
    assert result == "secret_value_123"
    # Cleanup
    row = db.get(AdminSetting, "test_key_rt")
    if row:
        db.delete(row)
        db.commit()


def test_get_unset_key_returns_none(db: Session) -> None:
    result = svc.get_setting(db, "nonexistent_key_xyz")
    assert result is None


def test_value_stored_encrypted(db: Session) -> None:
    plaintext = "my_openai_key_abc"
    svc.set_setting(db, "test_key_enc", plaintext)
    row = db.get(AdminSetting, "test_key_enc")
    assert row is not None
    assert row.encrypted_value != plaintext
    assert row.encrypted_value is not None
    # Cleanup
    db.delete(row)
    db.commit()


def test_upsert_overwrites_previous_value(db: Session) -> None:
    svc.set_setting(db, "test_key_upsert", "original")
    svc.set_setting(db, "test_key_upsert", "updated")
    result = svc.get_setting(db, "test_key_upsert")
    assert result == "updated"
    # Cleanup
    row = db.get(AdminSetting, "test_key_upsert")
    if row:
        db.delete(row)
        db.commit()


def test_corrupted_ciphertext_returns_none(db: Session) -> None:
    row = AdminSetting(key="test_key_corrupt", encrypted_value="not-valid-fernet-data")
    db.add(row)
    db.commit()
    result = svc.get_setting(db, "test_key_corrupt")
    assert result is None
    # Cleanup
    db.delete(row)
    db.commit()
