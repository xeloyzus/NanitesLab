"""NanitesLab API — FastAPI application.

Serves the JSON API and the dashboard frontend (Jinja2 templates + static
assets). Run with::

    uvicorn app.main:app
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db.database import pool
from .internal import health
from .routers import buildings, history, pages

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Open the pool before serving and close it cleanly on shutdown.
    await pool.open(wait=True)
    yield
    await pool.close()


app = FastAPI(title="NanitesLab API", version="1.0.0", lifespan=lifespan)

# The dashboard is served on the same origin, so CORS is normally unnecessary.
# Allowing GET from anywhere only eases local development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Frontend assets (CSS / JS / images).
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(buildings.router)
app.include_router(history.router)
app.include_router(health.router)
app.include_router(pages.router)

