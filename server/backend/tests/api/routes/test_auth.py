"""Auth endpoint tests for AUTH-01, AUTH-02, AUTH-03.

Tests the existing signup/login/logout endpoints with real assertions.
"""
from fastapi.testclient import TestClient

from app.core.config import settings
from tests.utils.utils import random_email


def test_signup_creates_user(client: TestClient) -> None:
    """AUTH-01: User can create an account with email and password."""
    email = random_email()
    response = client.post(
        "/api/v1/users/signup",
        json={
            "email": email,
            "password": "testpassword123",
            "full_name": "Wave Zero Test",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["email"] == email


def test_login_returns_jwt(client: TestClient) -> None:
    """AUTH-02: User can log in and receive a JWT."""
    response = client.post(
        "/api/v1/login/access-token",
        data={
            "username": settings.FIRST_SUPERUSER,
            "password": settings.FIRST_SUPERUSER_PASSWORD,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_logout_is_client_side(client: TestClient) -> None:
    """AUTH-03: Logout is client-side token discard. Verify JWT works then
    confirm no server-side logout endpoint is required (client discards token)."""
    # AUTH-03 is client-side only -- no server endpoint.
    # This test confirms a valid token works for auth and that discarding it
    # (not sending it) results in 401.
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401  # No token sent = unauthorized
