"""Application settings, loaded from environment variables (and ``.env``)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Field names map to UPPERCASE environment vars."""

    database_url: str
    # When true, serve deterministic mock data instead of querying the DB
    # (useful for local preview without a running database). Set DEMO_MODE=1.
    demo_mode: bool = False

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
