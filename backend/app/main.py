"""Entrypoint — run with ``python -m backend.app.main`` or ``uvicorn backend.app.main:app``.

This is the ONE primary backend server (domain foundation + planning,
simulation, evaluation and governance endpoints).

The frontend keeps working without this server: its planner service falls back
to the seeded synthetic data whenever the API is unreachable.
"""

from __future__ import annotations

import os
import uvicorn

from backend.app import config
from backend.app.api.app import app

# Ensure plans persist across restarts when running the operational backend server
os.environ.setdefault("RBPS_PERSIST_PLANS", "1")


def main() -> None:
    uvicorn.run(
        "backend.app.api.app:app",
        host=config.API_HOST,
        port=config.API_PORT,
        reload=False,
    )


if __name__ == "__main__":
    main()
