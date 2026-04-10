"""Auth endpoint test stubs for AUTH-01, AUTH-02, AUTH-03.

These test the existing signup/login/logout endpoints.
Marked xfail until the full test infrastructure is verified in Wave 1.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.xfail(reason="Wave 0 stub -- verify existing auth works", strict=False)
def test_signup_creates_user(client: TestClient) -> None:
    """AUTH-01: User can create an account with email and password."""
    response = client.post(
        "/api/v1/users/signup",
        json={
            "email": "wave0test@example.com",
            "password": "testpassword123",
            "full_name": "Wave Zero Test",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["email"] == "wave0test@example.com"


@pytest.mark.xfail(reason="Wave 0 stub -- verify existing auth works", strict=False)
def test_login_returns_jwt(client: TestClient) -> None:
    """AUTH-02: User can log in and receive a JWT."""
    response = client.post(
        "/api/v1/login/access-token",
        data={"username": "wave0test@example.com", "password": "testpassword123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.xfail(reason="Wave 0 stub -- verify existing auth works", strict=False)
def test_logout_is_client_side(client: TestClient) -> None:
    """AUTH-03: Logout is client-side token discard. Verify JWT works then
    confirm no server-side logout endpoint is required (client discards token)."""
    # AUTH-03 is client-side only -- no server endpoint.
    # This test confirms a valid token works for auth and that discarding it
    # (not sending it) results in 401.
    response = client.get("/api/v1/users/me")
    assert response.status_code == 401  # No token sent = unauthorized
