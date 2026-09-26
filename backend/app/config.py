"""Backend configuration for the Railway Block Planning domain foundation.

Centralises environment-driven settings so every layer (adapters, services,
API) reads one source of truth. Database access is deliberately abstracted:
the default repository is in-memory (seeded synthetic data) and a
PostgreSQL-backed repository can be selected with ``RBPS_REPO=postgres``.
"""

from __future__ import annotations

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
APP_DIR = BASE_DIR
BACKEND_DIR = BASE_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

#: Directory holding the seeded synthetic source datasets (parquet/csv).
DATA_DIR: Path = Path(os.getenv("RBPS_DATA_DIR", BACKEND_DIR / "app" / "data"))

#: Default priority-mapping configuration (JSON) for cross-department
#: normalisation. Can be overridden with RBPS_PRIORITY_CONFIG.
PRIORITY_CONFIG_PATH: Path = Path(
    os.getenv("RBPS_PRIORITY_CONFIG", APP_DIR / "models" / "priority_mapping.json")
)

# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------

#: Seed used by every synthetic dataset generator so adapters are reproducible.
SEED: int = int(os.getenv("RBPS_SEED", "20260914"))

#: Fixed "current time" for the synthetic planning night. Freshness, overdue
#: and deadline-pressure checks are evaluated against this instant so tests
#: and demo output are deterministic. Override only for new demo scenarios.
SIMULATION_NOW: str = os.getenv("RBPS_SIMULATION_NOW", "2026-09-14T18:00:00+05:30")


def simulation_now() -> "datetime":
    """The operational clock as a timezone-aware datetime (IST by default)."""
    from datetime import datetime

    return datetime.fromisoformat(SIMULATION_NOW)

# ---------------------------------------------------------------------------
# Data quality / freshness
# ---------------------------------------------------------------------------

#: A record older than this many hours (relative to the operational clock)
#: is STALE. The DataQualityEngine reads this default; adapters receive it
#: explicitly so every layer shares one configurable horizon.
STALENESS_HOURS: int = int(os.getenv("RBPS_STALENESS_HOURS", "36"))

# ---------------------------------------------------------------------------
# Repository
# ---------------------------------------------------------------------------

#: "memory" (default, seeded synthetic) or "postgres".
REPOSITORY_BACKEND: str = os.getenv("RBPS_REPO", "memory")

#: PostgreSQL DSN used when REPOSITORY_BACKEND == "postgres".
#: Example: postgresql+psycopg://rbps:rbps@localhost:5432/railway_blocks
DATABASE_URL: str | None = os.getenv("RBPS_DATABASE_URL")

#: Connection pool settings for the PostgreSQL repository.
DB_POOL_SIZE: int = int(os.getenv("RBPS_DB_POOL_SIZE", "5"))
DB_MAX_OVERFLOW: int = int(os.getenv("RBPS_DB_MAX_OVERFLOW", "10"))

# ---------------------------------------------------------------------------
# HTTP API
# ---------------------------------------------------------------------------

API_TITLE: str = "Railway Block Planning System — Domain API"
API_VERSION: str = "0.1.0"
API_HOST: str = os.getenv("RBPS_API_HOST", "127.0.0.1")
API_PORT: int = int(os.getenv("RBPS_API_PORT", "8000"))
