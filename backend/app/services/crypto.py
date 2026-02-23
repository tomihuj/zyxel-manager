import json
from app.core.security import encrypt_secret, decrypt_secret


def encrypt_credentials(username: str, password: str) -> str:
    return encrypt_secret(json.dumps({"username": username, "password": password}))


def decrypt_credentials(encrypted: str) -> dict:
    return json.loads(decrypt_secret(encrypted))
