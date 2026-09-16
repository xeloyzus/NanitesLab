"""Shared FastAPI dependencies (dependency injection).

The official FastAPI pattern: routes declare what they need in their
signature (here ``db: DbConn``) and FastAPI supplies it via ``Depends``.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from psycopg import AsyncConnection

from .db import pool


async def get_db() -> AsyncIterator[AsyncConnection]:
    """Yield one database connection from the shared pool, per request."""
    async with pool.connection() as conn:
        yield conn


# Alias so routes can write a clean `db: DbConn` parameter.
DbConn = Annotated[AsyncConnection, Depends(get_db)]
