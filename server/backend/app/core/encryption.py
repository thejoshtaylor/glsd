from cryptography.fernet import Fernet


def encrypt_token(plaintext: str, key: str) -> str:
    """Encrypt a plaintext token using Fernet symmetric encryption."""
    if not key:
        raise ValueError("Encryption key must not be empty")
    return Fernet(key.encode()).encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str, key: str) -> str:
    """Decrypt a Fernet-encrypted token."""
    if not key:
        raise ValueError("Encryption key must not be empty")
    return Fernet(key.encode()).decrypt(ciphertext.encode()).decode()
