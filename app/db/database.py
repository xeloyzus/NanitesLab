"""Database connection pool (async psycopg).

TimescaleDB is queried through plain Postgres SQL — the time-series extension
is transparent for these queries.
"""

from psycopg_pool import AsyncConnectionPool

from ..core.config import settings

# Created with ``open=False``; opened in ``main.py``'s lifespan handler.
pool = AsyncConnectionPool(settings.database_url, min_size=1, max_size=10, open=False)
