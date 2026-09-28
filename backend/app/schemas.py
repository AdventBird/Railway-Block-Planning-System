"""Canonical domain models for the Railway Block Planning System.

Every subsystem (ingestion, validation, planning, API) speaks only in these
canonical Pydantic models. Source-specific records (TMS / SMMS / TDMS / COA /
timetable) are normalised into them by the adapters in
``backend.app.adapters`` and never leak past the adapter boundary.

Conventions:
- identifiers are strings (``job_id``, ``corridor_id``, ``section_id``);
- datetimes are timezone-aware ISO 8601;
- there is deliberately NO numeric priority score — priority is expressed
  through the categorical attributes normalised by the priority mappings
  (safety_consequence, asset_criticality, urgency, ...) plus Tier 0-4.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Enums — block taxonomy & line configuration (Features 9 & 10)
# ---------------------------------------------------------------------------


class BlockType(str, Enum):
    """Block taxonomy: what kind of possession is being granted."""

    TRAFFIC = "TRAFFIC"                          # line block, power stays on
    POWER = "POWER"                              # power block, OHE isolated
    POWER_AND_TRAFFIC = "POWER_AND_TRAFFIC"      # both granted together


class LineConfiguration(str, Enum):
    """Track layout of a section."""

    SINGLE = "SINGLE"   # one line carries both directions
    DOUBLE = "DOUBLE"   # UP + DOWN lines, adjacent line may carry traffic


class LineDirection(str, Enum):
    """Direction served by a track within a section."""

    UP = "UP"
    DOWN = "DOWN"
    BOTH = "BOTH"       # single line — both directions share the same track


class WorkingLine(str, Enum):
    """Which physical line a maintenance job occupies on a section."""

    UP = "UP"
    DOWN = "DOWN"
    SINGLE = "SINGLE"   # only meaningful when the section itself is single-line


# ---------------------------------------------------------------------------
# Data quality (Feature 3)
# ---------------------------------------------------------------------------


class WorkPhase(str, Enum):
    """The three canonical phases of every maintenance possession (Feature 12)."""

    SETUP = "SETUP"
    WORK = "WORK"
    RESTORE = "RESTORE"


class DataQualityStatus(str, Enum):
    """Deterministic validation outcome for one canonical record."""

    READY = "READY"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    STALE = "STALE"
    INVALID = "INVALID"


class ValidationMessage(BaseModel):
    """One finding produced by the validation rule engine."""

    code: str = Field(description="Stable machine-readable rule id, e.g. MISSING_DURATION")
    field: Optional[str] = Field(
        default=None, description="Canonical field the finding refers to, if any"
    )
    severity: Literal["INFO", "WARNING", "ERROR"] = "WARNING"
    message: str = Field(description="Human-readable explanation, safe for an officer")


# ---------------------------------------------------------------------------
# Canonical operational records
# ---------------------------------------------------------------------------


class MaintenanceJob(BaseModel):
    """Unified canonical maintenance job.

    Built by an adapter from a source-specific record; departmental labels
    (severity / priority_label / urgency) are normalised through the
    configurable priority mapping, never compared across systems directly.
    """

    model_config = ConfigDict(use_enum_values=True)

    # Identity & provenance -------------------------------------------------
    job_id: str
    source_record_id: str = Field(description="Primary key in the source system")
    department: Literal["Engineering", "S&T", "TRD"]
    source_system: Literal["TMS", "SMMS", "TDMS", "BDMS"]
    title: str = ""

    # Where -----------------------------------------------------------------
    asset: str
    location: str
    corridor_id: str
    section_id: str = ""
    track_id: str = ""
    direction: Optional[str] = None
    severity: str = Field(
        default="",
        description="Raw source severity label, kept verbatim for the audit trail",
    )

    # Cross-department normalised priority attributes (Feature 5) -----------
    safety_consequence: Literal["IMMEDIATE_HALT", "SPEED_RESTRICTION", "ROUTINE"]
    asset_criticality: Literal["SAFETY_CRITICAL", "ESSENTIAL", "DISCRETIONARY"]
    urgency: Literal["IMMEDIATE", "HIGH", "NORMAL", "LOW"]
    deadline_pressure: Literal["OVERDUE", "IMMEDIATE", "SHORT", "COMFORTABLE"]
    operational_impact: Literal["NETWORK", "CORRIDOR", "LOCAL", "MINIMAL"]

    # Normalised flags -------------------------------------------------------
    overdue: bool
    overdue_days: int = Field(ge=0, default=0)

    # Timing -----------------------------------------------------------------
    deadline: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=0)
    setup_duration_minutes: int = Field(default=0, ge=0)
    restore_duration_minutes: int = Field(default=0, ge=0)

    @property
    def total_possession_minutes(self) -> int:
        """Total possession demand: setup + work + restore, never just work time."""
        return (self.setup_duration_minutes or 0) + (self.duration_minutes or 0) + (self.restore_duration_minutes or 0)

    # Feature 12 — explicit possession phases ---------------------------------
    # duration_minutes is the WORK phase only. The total possession demand is
    # setup + work + restore, never assumed equal to the work duration.
    work_phases: List[WorkPhase] = Field(
        default_factory=lambda: [WorkPhase.SETUP, WorkPhase.WORK, WorkPhase.RESTORE],
        description="Phases this job requires inside the possession",
    )

    # Block requirements -----------------------------------------------------
    block_type: Optional[BlockType] = None
    required_resources: List[str] = Field(default_factory=list)
    power_isolation_required: bool = False
    line_configuration: LineConfiguration
    working_line: WorkingLine = WorkingLine.SINGLE
    adjacent_line_operational: bool = Field(
        default=True,
        description="Double-line only: whether the adjacent line may carry "
        "traffic while the working line is blocked",
    )

    # Lifecycle & data quality ----------------------------------------------
    status: Literal["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "CLOSED"] = "OPEN"
    tier: Optional[int] = Field(default=None, ge=0, le=4)
    tier_reason: str = ""
    data_quality_status: DataQualityStatus = DataQualityStatus.REVIEW_REQUIRED
    data_quality_messages: List[ValidationMessage] = Field(default_factory=list)
    freshness_timestamp: Optional[datetime] = None

    @field_validator("overdue_days")
    @classmethod
    def _overdue_days_non_negative(cls, v: int) -> int:
        return max(0, v)


class TrainMovement(BaseModel):
    """Canonical train path inside the planning horizon."""

    model_config = ConfigDict(use_enum_values=True)

    train_id: str
    train_number: str = ""
    train_type: Literal["passenger", "freight", "special"]
    corridor_id: str
    section_id: str = ""
    track_id: str = ""
    direction: Optional[str] = None
    protected: bool = Field(
        description="Protected paths must never be regulated or overlapped"
    )
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None
    note: str = ""
    data_quality_status: DataQualityStatus = DataQualityStatus.READY
    data_quality_messages: List[ValidationMessage] = Field(default_factory=list)


class BlockWindow(BaseModel):
    """Canonical block window (proposed or sanctioned possession)."""

    model_config = ConfigDict(use_enum_values=True)

    window_id: str
    block_id: str = Field(default="", description="Sanctioned block number, e.g. BLK-2026-0423")
    corridor_id: str
    section_id: str = ""
    track_id: str = ""
    direction: LineDirection = LineDirection.BOTH
    block_type: BlockType = BlockType.TRAFFIC
    status: Literal["proposed", "pending", "approved", "rejected", "locked"] = "proposed"
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    possession_start: Optional[datetime] = None
    possession_end: Optional[datetime] = None
    duration_minutes: int = Field(ge=0, default=0)
    note: str = ""
    job_ids: List[str] = Field(default_factory=list)
    affected_train_ids: List[str] = Field(default_factory=list)
    required_resources: List[str] = Field(default_factory=list)
    isolation_requirements: List[str] = Field(default_factory=list)
    data_quality_status: DataQualityStatus = DataQualityStatus.READY
    data_quality_messages: List[ValidationMessage] = Field(default_factory=list)


class Station(BaseModel):
    """Canonical station node in the railway network."""

    model_config = ConfigDict(use_enum_values=True)

    id: str
    name: str
    code: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    junction: bool = False


class Track(BaseModel):
    """Canonical physical track belonging to a section with explicit direction and line type."""

    model_config = ConfigDict(use_enum_values=True)

    id: str
    section_id: str
    direction: LineDirection  # UP | DOWN | BOTH
    line_type: LineConfiguration  # SINGLE | DOUBLE
    status: Literal["clear", "occupied", "maintenance", "blocked", "caution"] = "clear"


class Resource(BaseModel):
    """Canonical shared resource (machine, crew, test equipment)."""

    model_config = ConfigDict(use_enum_values=True)

    resource_id: str
    name: str
    resource_type: Literal["MACHINE", "CREW", "EQUIPMENT", "PARTY"]
    department: Literal["Engineering", "S&T", "TRD", "SHARED"] = "SHARED"
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    availability_note: str = ""
    data_quality_status: DataQualityStatus = DataQualityStatus.READY
    data_quality_messages: List[ValidationMessage] = Field(default_factory=list)


class Corridor(BaseModel):
    """Canonical corridor — a directional routing between two stations."""

    model_config = ConfigDict(use_enum_values=True)

    corridor_id: str
    label: str
    origin_station: str
    destination_station: str
    line_configuration: LineConfiguration


class Section(BaseModel):
    """Canonical physical section between two adjacent stations.

    Hierarchy: Network -> Section -> Track -> Block -> Jobs
    """

    model_config = ConfigDict(use_enum_values=True)

    section_id: str
    name: str
    corridor_id: str
    from_station_id: str
    to_station_id: str
    line_configuration: LineConfiguration
    lines: List[LineDirection] = Field(default_factory=list)
    tracks: List[Track] = Field(default_factory=list)
    operational_status: Literal["clear", "occupied", "blocked", "maintenance", "caution"] = "clear"


class RailwayPath(BaseModel):
    """Canonical route/path traversing one or more sections."""

    model_config = ConfigDict(use_enum_values=True)

    id: str
    name: str
    section_ids: List[str] = Field(default_factory=list)
    direction: LineDirection = LineDirection.BOTH


# ---------------------------------------------------------------------------
# Canonical Plan, Revisions, Assignments & Decisions
# ---------------------------------------------------------------------------


class BlockAssignment(BaseModel):
    """Explicit block assignment produced by planner or officer modification."""

    model_config = ConfigDict(use_enum_values=True)

    id: str
    plan_revision_id: str = ""
    block_id: str
    section_id: str
    track_id: str
    direction: LineDirection = LineDirection.BOTH
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    possession_start: Optional[datetime] = None
    possession_end: Optional[datetime] = None
    block_type: BlockType = BlockType.TRAFFIC
    job_ids: List[str] = Field(default_factory=list)
    execution_mode: str = "SEQUENTIAL"
    status: str = "PLANNED"


class PlanDecision(BaseModel):
    """Auditable officer decision on a plan revision."""

    model_config = ConfigDict(use_enum_values=True)

    id: str
    plan_id: str
    plan_revision_id: str
    action: Literal["APPROVE", "MODIFY", "REJECT", "LOCK"]
    officer: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(datetime.now().astimezone().tzinfo))
    reason: str = ""
    affected_jobs: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PlanRevision(BaseModel):
    """Immutable plan revision within a plan's lifecycle."""

    model_config = ConfigDict(use_enum_values=True)

    id: str
    plan_id: str
    revision_number: int
    based_on_revision_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(datetime.now().astimezone().tzinfo))
    created_by: str = "planner"
    reason: str = "Initial plan generation"
    status: Literal["DRAFT", "PENDING_APPROVAL", "APPROVED", "MODIFIED", "REJECTED", "LOCKED", "STALE", "INFEASIBLE"] = "PENDING_APPROVAL"
    assignments: List[BlockAssignment] = Field(default_factory=list)
    deferred_jobs: List[Dict[str, Any]] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    raw_plan_data: Dict[str, Any] = Field(default_factory=dict)


class Plan(BaseModel):
    """Canonical Plan entity over a planning horizon with multiple revisions."""

    model_config = ConfigDict(use_enum_values=True)

    id: str
    horizon: str
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    status: str = "PENDING_APPROVAL"
    current_revision_id: str = ""
    revisions: List[PlanRevision] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Simulation Schemas (Section 18)
# ---------------------------------------------------------------------------


class SimulationEvent(BaseModel):
    """Structured simulation event payload."""

    type: str  # SPECIAL_TRAIN | REDUCE_BLOCK_WINDOW | REMOVE_BLOCK | EMERGENCY_JOB | RESOURCE_UNAVAILABLE | PRIORITY_CHANGE | DEADLINE_CHANGE | OPERATIONAL_RESTRICTION
    parameters: Dict[str, Any] = Field(default_factory=dict)


class SimulationRequest(BaseModel):
    """Request envelope for POST /api/plans/{plan_id}/simulate."""

    block_id: str
    event: SimulationEvent


class SimulationResponse(BaseModel):
    """Response envelope for POST /api/plans/{plan_id}/simulate."""

    status: str  # FEASIBLE | INFEASIBLE
    baseline: Dict[str, Any]
    event: Dict[str, Any]
    simulated: Dict[str, Any]
    changes: List[Dict[str, Any]] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)
    alternatives: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Plan request / response envelope
# ---------------------------------------------------------------------------


class PlanRequest(BaseModel):
    """Request for a recommended block plan (planner wired in later phases).

    CP-SAT optimisation is intentionally NOT implemented here; this model only
    fixes the canonical request shape the planner will consume.
    """

    model_config = ConfigDict(use_enum_values=True)

    plan_date: str = Field(description="Planning night, e.g. 2026-09-14")
    job_ids: List[str] = Field(default_factory=list, description="Empty = all READY jobs")
    corridor_ids: List[str] = Field(default_factory=list)
    block_window_ids: List[str] = Field(default_factory=list)
    include_review_required: bool = False
    options: Dict[str, Any] = Field(default_factory=dict)


class DataQualitySummary(BaseModel):
    """Counts per canonical data-quality status."""

    ready: int = 0
    review_required: int = 0
    stale: int = 0
    invalid: int = 0

    def bump(self, status: "DataQualityStatus | str") -> None:
        key = (status.value if isinstance(status, DataQualityStatus) else str(status)).lower()
        setattr(self, key, getattr(self, key) + 1)


class ApiEnvelope(BaseModel):
    """Single canonical response structure returned by every endpoint."""

    model_config = ConfigDict(use_enum_values=True)

    status: Literal["READY", "REVIEW_REQUIRED", "STALE", "INVALID", "ERROR", "OK"]
    generated_at: datetime = Field(default_factory=lambda: datetime.now(datetime.now().astimezone().tzinfo))
    payload: Dict[str, Any] = Field(default_factory=dict)
    data_quality: Optional[DataQualitySummary] = None
    errors: List[ValidationMessage] = Field(default_factory=list)
