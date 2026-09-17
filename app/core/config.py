"""Application settings, loaded from environment variables (and ``.env``)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Field names map to UPPERCASE environment vars."""

    # Required for live mode. Demo mode can run without a database.
    database_url: str | None = None
    # When true, serve deterministic mock data instead of querying TimescaleDB
    # (useful for local preview without a running database). Set DEMO_MODE=1.
    demo_mode: bool = False
    kiosk_refresh_seconds: int = 60

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def runtime_mode(self) -> str:
        return "demo" if self.demo_mode else "live"

    @property
    def data_source(self) -> str:
        return "deterministic-demo" if self.demo_mode else "timescaledb"

    def require_database_url(self) -> str:
        if not self.database_url:
            raise RuntimeError("DATABASE_URL is required when DEMO_MODE is false.")
        return self.database_url


settings = Settings()
