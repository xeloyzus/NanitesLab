"""Building schema."""

from pydantic import BaseModel


class Building(BaseModel):
    id: int
    name: str
    slug: str
