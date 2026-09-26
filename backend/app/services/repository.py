"""Repository layer — PostgreSQL-compatible design with a seeded in-memory default.

The API never touches storage directly: it goes through ``WorldRepository``.
Two implementations ship here:

- ``InMemoryRepository``  — builds canonical state from the seeded synthetic
  datasets at construction; the application falls back to it whenever no
  database is configured, so the frontend keeps working without the backend.
- ``PostgresRepository``  — same interface, backed by SQLAlchemy async/plain
  engines against PostgreSQL. The DDL lives in ``SCHEMA_SQL`` so the tables can
  be created with any driver; selection is via ``RBPS_REPO=postgres``.
"""

from __future__ import annotations

import json
import threading
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from backend.app import config
from backend.app.schemas import (
    BlockWindow,
    Corridor,
    MaintenanceJob,
    Resource,
    Section,
    TrainMovement,
)
from backend.app.services.ingestion import IngestionResult, IngestionService

# ---------------------------------------------------------------------------
# PostgreSQL schema (kept here so the design is DB-complete without forcing a
# driver dependency at import time).
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS corridors (
    corridor_id        TEXT PRIMARY KEY,
    label              TEXT NOT NULL,
    origin_station     TEXT NOT NULL,
    destination_station TEXT NOT NULL,
    line_configuration TEXT NOT NULL CHECK (line_configuration IN ('SINGLE','DOUBLE'))
);

CREATE TABLE IF NOT EXISTS sections (
    section_id         TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    corridor_id        TEXT NOT NULL REFERENCES corridors(corridor_id),
    from_station_id    TEXT NOT NULL,
    to_station_id      TEXT NOT NULL,
    line_configuration TEXT NOT NULL CHECK (line_configuration IN ('SINGLE','DOUBLE')),
    lines              JSONB NOT NULL DEFAULT '[]',
    operational_status TEXT NOT NULL DEFAULT 'clear'
);

CREATE TABLE IF NOT EXISTS maintenance_jobs (
    job_id                   TEXT PRIMARY KEY,
    source_record_id         TEXT NOT NULL,
    department               TEXT NOT NULL,
    source_system            TEXT NOT NULL,
    title                    TEXT NOT NULL DEFAULT '',
    asset                    TEXT NOT NULL,
    location                 TEXT NOT NULL,
    corridor_id              TEXT REFERENCES corridors(corridor_id),
    section_id               TEXT NOT NULL DEFAULT '',
    severity                 TEXT NOT NULL,
    safety_consequence       TEXT NOT NULL,
    asset_criticality        TEXT NOT NULL,
    urgency                  TEXT NOT NULL,
    deadline_pressure        TEXT NOT NULL,
    operational_impact       TEXT NOT NULL,
    overdue                  BOOLEAN NOT NULL DEFAULT FALSE,
    overdue_days             INTEGER NOT NULL DEFAULT 0,
    deadline                 TIMESTAMPTZ,
    duration_minutes         INTEGER,
    setup_duration_minutes   INTEGER NOT NULL DEFAULT 0,
    restore_duration_minutes INTEGER NOT NULL DEFAULT 0,
    block_type               TEXT CHECK (block_type IN ('TRAFFIC','POWER','POWER_AND_TRAFFIC')),
    required_resources       JSONB NOT NULL DEFAULT '[]',
    power_isolation_required BOOLEAN NOT NULL DEFAULT FALSE,
    line_configuration       TEXT NOT NULL CHECK (line_configuration IN ('SINGLE','DOUBLE')),
    working_line             TEXT NOT NULL DEFAULT 'SINGLE',
    adjacent_line_operational BOOLEAN NOT NULL DEFAULT TRUE,
    status                   TEXT NOT NULL DEFAULT 'OPEN',
    tier                     INTEGER,
    tier_reason              TEXT NOT NULL DEFAULT '',
    data_quality_status      TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
                             CHECK (data_quality_status IN ('READY','REVIEW_REQUIRED','STALE','INVALID')),
    data_quality_messages    JSONB NOT NULL DEFAULT '[]',
    freshness_timestamp      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS train_movements (
    train_id      TEXT PRIMARY KEY,
    train_number  TEXT NOT NULL DEFAULT '',
    train_type    TEXT NOT NULL CHECK (train_type IN ('passenger','freight','special')),
    corridor_id   TEXT REFERENCES corridors(corridor_id),
    protected     BOOLEAN NOT NULL DEFAULT FALSE,
    entry_time    TIMESTAMPTZ,
    exit_time     TIMESTAMPTZ,
    note          TEXT NOT NULL DEFAULT '',
    data_quality_status TEXT NOT NULL DEFAULT 'READY',
    data_quality_messages JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS block_windows (
    window_id      TEXT PRIMARY KEY,
    block_id       TEXT NOT NULL,
    corridor_id    TEXT REFERENCES corridors(corridor_id),
    block_type     TEXT NOT NULL CHECK (block_type IN ('TRAFFIC','POWER','POWER_AND_TRAFFIC')),
    status         TEXT NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed','pending','approved','rejected','locked')),
    start          TIMESTAMPTZ,
    end            TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    note           TEXT NOT NULL DEFAULT '',
    data_quality_status TEXT NOT NULL DEFAULT 'READY',
    data_quality_messages JSONB NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS resources (
    resource_id     TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    resource_type   TEXT NOT NULL CHECK (resource_type IN ('MACHINE','CREW','EQUIPMENT','PARTY')),
    department      TEXT NOT NULL DEFAULT 'SHARED',
    available_from  TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    availability_note TEXT NOT NULL DEFAULT '',
    data_quality_status TEXT NOT NULL DEFAULT 'READY',
    data_quality_messages JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_jobs_corridor ON maintenance_jobs (corridor_id);
CREATE INDEX IF NOT EXISTS idx_jobs_dq ON maintenance_jobs (data_quality_status);
CREATE INDEX IF NOT EXISTS idx_trains_corridor ON train_movements (corridor_id);
CREATE INDEX IF NOT EXISTS idx_blocks_corridor ON block_windows (corridor_id);
"""


class WorldRepository(ABC):
    """Persistence boundary for the canonical world state."""

    @abstractmethod
    def load(self) -> IngestionResult:
        """Load (or rebuild) the canonical world state."""

    @abstractmethod
    def save(self, world: IngestionResult) -> None:
        """Persist the canonical world state."""

    @abstractmethod
    def refresh(self) -> IngestionResult:
        """Force a fresh ingestion pass and return the new state."""


class InMemoryRepository(WorldRepository):
    """Seeded synthetic repository — the development default.

    Rebuilds canonical state from ``app/data`` on demand with thread-safe
    double-checked locking so concurrent API calls share one world snapshot.
    """

    def __init__(self, data_dir: Optional[Any] = None, validate: bool = True) -> None:
        self._data_dir = data_dir
        self._validate = validate
        self._world: Optional[IngestionResult] = None
        self._lock = threading.Lock()

    def load(self) -> IngestionResult:
        if self._world is None:
            with self._lock:
                if self._world is None:
                    self._world = IngestionService(
                        data_dir=self._data_dir, validate=self._validate
                    ).ingest()
        return self._world

    def save(self, world: IngestionResult) -> None:
        with self._lock:
            self._world = world

    def refresh(self) -> IngestionResult:
        with self._lock:
            self._world = IngestionService(
                data_dir=self._data_dir, validate=self._validate
            ).ingest()
        return self._world


class PostgresRepository(WorldRepository):
    """SQLAlchemy-backed repository.

    Requires ``SQLAlchemy`` + a PostgreSQL driver (e.g. psycopg) at runtime —
    imported lazily so the in-memory default never pays that cost.
    """

    def __init__(self, database_url: Optional[str] = None) -> None:
        self._database_url = database_url or config.DATABASE_URL
        if not self._database_url:
            raise ValueError(
                "PostgresRepository selected but RBPS_DATABASE_URL is not configured."
            )
        self._engine: Any = None

    def _get_engine(self) -> Any:
        if self._engine is None:
            from sqlalchemy import create_engine  # lazy import

            self._engine = create_engine(
                self._database_url,
                pool_size=config.DB_POOL_SIZE,
                max_overflow=config.DB_MAX_OVERFLOW,
                pool_pre_ping=True,
            )
        return self._engine

    def create_schema(self) -> None:
        """Create the canonical tables (idempotent)."""
        from sqlalchemy import text

        with self._get_engine().begin() as conn:
            for statement in filter(None, (s.strip() for s in SCHEMA_SQL.split(";"))):
                conn.execute(text(statement))

    def load(self) -> IngestionResult:
        """Read canonical state from PostgreSQL."""
        from sqlalchemy import text

        world = IngestionResult(report=None)
        with self._get_engine().connect() as conn:
            rows = conn.execute(
                text("SELECT * FROM maintenance_jobs")
            ).mappings().all()
            world.jobs = [MaintenanceJob(**dict(r)) for r in rows]
            rows = conn.execute(text("SELECT * FROM train_movements")).mappings().all()
            world.trains = [TrainMovement(**dict(r)) for r in rows]
            rows = conn.execute(text("SELECT * FROM block_windows")).mappings().all()
            world.blocks = [BlockWindow(**dict(r)) for r in rows]
            rows = conn.execute(text("SELECT * FROM resources")).mappings().all()
            world.resources = [Resource(**dict(r)) for r in rows]
            rows = conn.execute(text("SELECT * FROM corridors")).mappings().all()
            world.corridors = [Corridor(**dict(r)) for r in rows]
            rows = conn.execute(text("SELECT * FROM sections")).mappings().all()
            world.sections = [Section(**dict(r)) for r in rows]
        return world

    def save(self, world: IngestionResult) -> None:
        """Upsert canonical state into PostgreSQL."""
        from sqlalchemy import text

        with self._get_engine().begin() as conn:
            for corridor in world.corridors:
                conn.execute(text(
                    "INSERT INTO corridors (corridor_id, label, origin_station, "
                    "destination_station, line_configuration) VALUES (:corridor_id, "
                    ":label, :origin_station, :destination_station, "
                    ":line_configuration) ON CONFLICT (corridor_id) DO NOTHING"
                ), corridor.model_dump())
            for job in world.jobs:
                data = json.loads(job.model_dump_json())
                conn.execute(text(
                    "INSERT INTO maintenance_jobs (job_id) VALUES (:job_id) "
                    "ON CONFLICT (job_id) DO NOTHING"
                ), {"job_id": job.job_id})
                conn.execute(
                    text("UPDATE maintenance_jobs SET "
                         "source_record_id = :source_record_id, "
                         "department = :department, source_system = :source_system, "
                         "title = :title, asset = :asset, location = :location, "
                         "corridor_id = :corridor_id, section_id = :section_id, "
                         "severity = :severity, safety_consequence = :safety_consequence, "
                         "asset_criticality = :asset_criticality, urgency = :urgency, "
                         "deadline_pressure = :deadline_pressure, "
                         "operational_impact = :operational_impact, overdue = :overdue, "
                         "overdue_days = :overdue_days, deadline = :deadline, "
                         "duration_minutes = :duration_minutes, "
                         "setup_duration_minutes = :setup_duration_minutes, "
                         "restore_duration_minutes = :restore_duration_minutes, "
                         "block_type = :block_type, required_resources = :required_resources, "
                         "power_isolation_required = :power_isolation_required, "
                         "line_configuration = :line_configuration, "
                         "working_line = :working_line, "
                         "adjacent_line_operational = :adjacent_line_operational, "
                         "status = :status, tier = :tier, tier_reason = :tier_reason, "
                         "data_quality_status = :data_quality_status, "
                         "data_quality_messages = :data_quality_messages, "
                         "freshness_timestamp = :freshness_timestamp "
                         "WHERE job_id = :job_id"),
                    data,
                )
            for train in world.trains:
                data = json.loads(train.model_dump_json())
                conn.execute(text(
                    "INSERT INTO train_movements (train_id) VALUES (:train_id) "
                    "ON CONFLICT (train_id) DO NOTHING"
                ), {"train_id": train.train_id})
                conn.execute(
                    text("UPDATE train_movements SET train_number = :train_number, "
                         "train_type = :train_type, corridor_id = :corridor_id, "
                         "protected = :protected, entry_time = :entry_time, "
                         "exit_time = :exit_time, note = :note, "
                         "data_quality_status = :data_quality_status, "
                         "data_quality_messages = :data_quality_messages "
                         "WHERE train_id = :train_id"),
                    data,
                )
            for block in world.blocks:
                data = json.loads(block.model_dump_json())
                conn.execute(text(
                    "INSERT INTO block_windows (window_id) VALUES (:window_id) "
                    "ON CONFLICT (window_id) DO NOTHING"
                ), {"window_id": block.window_id})
                conn.execute(
                    text("UPDATE block_windows SET block_id = :block_id, "
                         "corridor_id = :corridor_id, block_type = :block_type, "
                         "status = :status, start = :start, \"end\" = :end, "
                         "duration_minutes = :duration_minutes, note = :note, "
                         "data_quality_status = :data_quality_status, "
                         "data_quality_messages = :data_quality_messages "
                         "WHERE window_id = :window_id"),
                    data,
                )
            for resource in world.resources:
                data = json.loads(resource.model_dump_json())
                conn.execute(text(
                    "INSERT INTO resources (resource_id) VALUES (:resource_id) "
                    "ON CONFLICT (resource_id) DO NOTHING"
                ), {"resource_id": resource.resource_id})
                conn.execute(
                    text("UPDATE resources SET name = :name, "
                         "resource_type = :resource_type, department = :department, "
                         "available_from = :available_from, "
                         "available_until = :available_until, "
                         "availability_note = :availability_note, "
                         "data_quality_status = :data_quality_status, "
                         "data_quality_messages = :data_quality_messages "
                         "WHERE resource_id = :resource_id"),
                    data,
                )

    def refresh(self) -> IngestionResult:
        world = IngestionService().ingest()
        self.create_schema()
        self.save(world)
        return world


def get_repository() -> WorldRepository:
    """Repository factory selected by configuration."""
    if config.REPOSITORY_BACKEND.lower() == "postgres":
        return PostgresRepository()
    return InMemoryRepository()
