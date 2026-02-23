from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = "postgresql://zyxel:changeme@localhost:5432/zyxelmanager"
    redis_url: str = "redis://:changeme@localhost:6379/0"

    secret_key: str = "changeme_at_least_32_chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Fernet key for encrypting device credentials
    encryption_key: str = "changeme_32_byte_base64_encoded_fernet_key=="

    admin_email: str = "admin@example.com"
    admin_username: str = "admin"
    admin_password: str = "Admin1234!"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
