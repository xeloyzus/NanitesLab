"""Application settings, loaded from environment variables (and ``.env``)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Field names map to UPPERCASE environment vars."""

    database_url: str

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
