"""Shared test configuration.

Set ``DATABASE_URL`` before any test imports the app so ``Settings`` can load
without a real database (tests only inspect the app; they never connect).
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://user:pass@localhost:5432/naniteslab"
)
