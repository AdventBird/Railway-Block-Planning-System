"""Shared pytest fixtures for the domain foundation tests."""

from __future__ import annotations

import pytest

from backend.app.schemas import MaintenanceJob
from backend.app.services.ingestion import IngestionResult, IngestionService
from backend.app.services.repository import InMemoryRepository


@pytest.fixture(scope="session")
def world() -> IngestionResult:
    """One shared ingestion pass over the seeded synthetic datasets."""
    return IngestionService().ingest()


@pytest.fixture()
def repository() -> InMemoryRepository:
    """A fresh in-memory repository per test (its own world snapshot)."""
    return InMemoryRepository()


def make_job(**overrides) -> MaintenanceJob:
    """Factory for a canonical READY job, overridden per test."""
    base = dict(
        job_id="TEST-JOB",
        source_record_id="REC-1",
        department="Engineering",
        source_system="TMS",
        asset="Track asset",
        location="KM 10",
        corridor_id="C1",
        severity="MINOR",
        safety_consequence="ROUTINE",
        asset_criticality="DISCRETIONARY",
        urgency="NORMAL",
        deadline_pressure="COMFORTABLE",
        operational_impact="LOCAL",
        overdue=False,
        overdue_days=0,
        deadline="2026-09-30T00:00:00+05:30",
        duration_minutes=60,
        block_type="TRAFFIC",
        required_resources=["P-Way welding party"],
        power_isolation_required=False,
        line_configuration="DOUBLE",
        working_line="UP",
        adjacent_line_operational=True,
        freshness_timestamp="2026-09-14T17:00:00+05:30",
    )
    base.update(overrides)
    return MaintenanceJob(**base)


@pytest.fixture()
def job_factory():
    return make_job
