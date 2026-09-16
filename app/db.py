"""Database access for the API.

A single async psycopg connection pool. TimescaleDB is queried through plain
Postgres SQL — the time-series extension is transparent for these queries.
"""

import os

from psycopg_pool import AsyncConnectionPool

DATABASE_URL = os.environ["DATABASE_URL"]

# Created with ``open=False``; opened in ``main.py``'s lifespan handler.
pool = AsyncConnectionPool(DATABASE_URL, min_size=1, max_size=10, open=False)
