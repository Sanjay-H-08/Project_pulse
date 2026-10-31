import os
from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_SQLITE_PATH = BACKEND_DIR / "projectpulse.db"


class Settings(BaseSettings):
    PROJECT_NAME: str = "ProgNix"
    VERSION: str = "0.1.0"
    DESCRIPTION: str = "ProgNix Industrial project planning and monitoring platform API"
    API_V1_STR: str = "/api/v1"

    # Security & Auth
    SECRET_KEY: str = "prognix-secret-jwt-key-2026-secure-session-token"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = f"sqlite:///{DEFAULT_SQLITE_PATH}"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS Origins
    # Defaults include standard ports used by static frontend development servers
    CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5500",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
    ]

    # Regex matching localhost / 127.0.0.1 on any port
    CORS_ORIGIN_REGEX: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_connection(cls, v: str) -> str:
        if isinstance(v, str) and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return []

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
