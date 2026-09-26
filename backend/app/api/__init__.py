"""API package — ONE primary FastAPI application.

``backend.app.api.app:create_app`` builds the single production server:
domain foundation endpoints (health/jobs/trains/blocks/network/ingest/
validate) plus planning, simulation, evaluation and governance endpoints
(planner/run, replan, scenarios, evaluate, block-clearance, plans/*).

The former zero-dependency legacy server (``api.legacy``) was retired when
all of its endpoints moved onto this application.
"""

from backend.app.api.app import create_app, app

__all__ = ["create_app", "app"]
