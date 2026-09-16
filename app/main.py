"""NanitesLab API — FastAPI application.

Run with::

    uvicorn app.main:app
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db.database import pool
from .internal import health
from .routers import buildings, history


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Open the pool before serving and close it cleanly on shutdown.
    await pool.open(wait=True)
    yield
    await pool.close()


app = FastAPI(title="NanitesLab API", version="1.0.0", lifespan=lifespan)

# The dashboard is served by Caddy on the same origin, so CORS is normally
# unnecessary. Allowing GET from anywhere only eases local development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(buildings.router)
app.include_router(history.router)
app.include_router(health.router)
