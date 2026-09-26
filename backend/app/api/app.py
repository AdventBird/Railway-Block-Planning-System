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

    # The dev frontend runs on Vite (5173); allow the local origins.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
