"""Application configuration settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings schema and defaults."""

    APP_NAME: str = "TestRunner Pro"
    DATABASE_URL: str = "sqlite+aiosqlite:///./testrunner.db"
    DEBUG: bool = True
    DEFAULT_BROWSER: str = "chromium"
    DEFAULT_HEADLESS: bool = True
    DEFAULT_TIMEOUT: int = 30000
    REPORTS_DIR: str = "./reports"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
