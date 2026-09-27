"""FastAPI application factory for the domain foundation API."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app import config
from backend.app.services.domain import DomainService
from backend.app.services.repository import get_repository

from backend.app.api.planning_routes import router as planning_router
from backend.app.api.routes import router as api_router


def create_app() -> FastAPI:
    app = FastAPI(
        title=config.API_TITLE,
        version=config.API_VERSION,
        description=(
            "Canonical domain foundation for the Railway Block Planning System. "
            "All endpoints return the single canonical envelope "
            "{status, generated_at, payload, data_quality, errors}."
        ),
    )

    # The demo frontend runs from any local origin: vite dev (5173), vite
    # preview (4173) and serve.mjs (5252) — a configurable localhost regex.
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=config.CORS_ORIGIN_REGEX,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    repository = get_repository()
    domain = DomainService(repository)
    app.state.domain = domain
    app.state.repository = repository

    # ONE primary application: domain foundation + planning/governance.
    app.include_router(api_router, prefix="/api")
    app.include_router(planning_router, prefix="/api")
    return app


app = create_app()
