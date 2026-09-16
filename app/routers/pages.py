"""HTML page routes (server-rendered Jinja2 templates)."""

from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates

# Anchor to the app package so templates resolve regardless of the working dir.
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"

# Excluded from the OpenAPI schema: these are HTML pages, not JSON API routes.
router = APIRouter(include_in_schema=False)
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@router.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@router.get("/mobile")
async def mobile(request: Request):
    return templates.TemplateResponse(request, "mobile.html")
