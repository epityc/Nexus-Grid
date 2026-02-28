from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

_DEFAULT_SECRET = "dev-secret-key-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Nexus-Grid"
    app_env: str = "development"

    # Security
    secret_key: str = _DEFAULT_SECRET
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/nexusgrid"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Anthropic
    anthropic_api_key: str = ""

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    @model_validator(mode="after")
    def check_production_secrets(self) -> "Settings":
        if self.app_env == "production":
            if self.secret_key == _DEFAULT_SECRET:
                raise ValueError(
                    "SECRET_KEY must be set to a strong random value in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
                )
            if not self.anthropic_api_key:
                raise ValueError("ANTHROPIC_API_KEY must be set in production")
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
