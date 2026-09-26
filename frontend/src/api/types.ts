// ---------------------------------------------------------------------------
// Planner API contract — the shapes the backend serves and the UI consumes.
// ---------------------------------------------------------------------------
// One shared type module (§34): every API-facing interface lives here and is
// derived from the canonical backend responses.
//
// Rules kept from the Phase 1 audit:
//   • no AI / confidence score fields — priority is Tier 0–4 only;
//   • project terminology only (tier, reason code, corridor, window, block);
//   • both snake_case (backend payload convention, e.g. `job_id`) and the
//     camelCase used by the existing data files are accepted — the service
//     normalises either form before it reaches the UI.
// ---------------------------------------------------------------------------

import type { ReasonCode } from "../data/planData";

/** A deferral reason code — re-used from the existing plan data module. */
export type { ReasonCode };

/** Tier 0–4 priority rulebook (no numeric scores). */
export type PlannerTier = 0 | 1 | 2 | 3 | 4;

/** Departments that own maintenance work on the trunk. */
export type PlannerDepartment = "Engineering" | "S&T" | "TRD";

/** Lifecycle of a proposed window / sanctioned block. */
export type PlannerWindowStatus =
  | "proposed"
  | "pending"
  | "approved"
  | "rejected"
  | "locked";

/** Solver verdict, reported honestly (§29). */
export type PlannerStatus =
  | "OPTIMAL"
  | "FEASIBLE"
  | "HEURISTIC"
  | "INFEASIBLE"
  | "MODEL_INVALID"
  | "UNKNOWN";

/* -------------------------------------------------------------------------- */
/* Response status                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Health of the planner service for one call.
 *   "live"     → served by a backend this call;
 *   "fallback" → backend absent / unreachable / invalid → synthetic data used;
 *   "unknown"  → before the first call resolves.
 */
export type PlannerApiStatus = "live" | "fallback" | "unknown";

/** Where a resolved payload actually came from. */
export interface PlannerSource {
  status: PlannerApiStatus;
  /** Endpoint that was attempted, e.g. "/api/planner/run". */
  endpoint?: string;
  /** Plain-language reason the fallback was used (safe to show an officer). */
  message?: string;
}

/* -------------------------------------------------------------------------- */
/* Assignments & deferrals                                                    */
/* -------------------------------------------------------------------------- */

/** One job placed inside a block window with its actual scheduled interval. */
export interface PlannerAssignment {
  jobId: string;
  windowId: string;
  /** HH:MM display form (backend formats from the continuous timeline). */
  start: string;
  end: string;
  /** Continuous-timeline minutes (cross-midnight safe) when available. */
  startMinutes?: number;
  endMinutes?: number;
  parallel?: boolean;
  note?: string;
  /** Possession minutes (setup + work + restore). */
  possessionMinutes?: number;
  /* ---------------- context added by the frontend service ---------------- */
  title?: string;
  department?: PlannerDepartment | string;
  tier?: PlannerTier;
  corridorId?: string;
  /** Duration the job itself needs, independent of the window it sits in. */
  minutes?: number;
  resources?: string[];
}

/** A job the planner could not place, with backend-owned reason codes. */
export interface DeferredJob {
  jobId: string;
  code: ReasonCode;
  /** Human-readable deferral explanation (from the backend). */
  reason: string;
  /* ---------------- context added by the frontend service ---------------- */
  title?: string;
  department?: PlannerDepartment | string;
  tier?: PlannerTier;
  corridorId?: string;
  minutes?: number;
  resources?: string[];
  /** Backend may return one or many codes for the same job. */
  reasonCodes?: ReasonCode[];
  /** Structured blocking constraints (backend diagnostics). */
  blockingConstraints?: string[];
  /** Structured explanation (what / what it means / next opportunity). */
  explanations?: { what?: string; means?: string; remedy?: string };
  /** Next feasible window, e.g. "Thu 17 Sep — REMM crane returns from POH". */
  nextFeasibleWindow?: string;
  /** Normalised status of the job row in the plan. */
  status?: PlannerWindowStatus;
}

/* -------------------------------------------------------------------------- */
/* Windows                                                                    */
/* -------------------------------------------------------------------------- */

/** Full detail for one window / sanctioned block. */
export interface WindowDetails {
  windowId: string;
  /** Proposed window id (`W1`) or sanctioned block id (`BLK-2026-0412`). */
  label?: string;
  blockId?: string;
  corridorId: string;
  /** Human-readable corridor, e.g. "NDLS–GZB (UP)". */
  corridorLabel?: string;
  start: string;
  end: string;
  minutes: number;
  status?: PlannerWindowStatus;
  /** Why this window exists, e.g. "Traffic gap between Down Rajdhani paths…". */
  note?: string;
  /** Work description carried by already-sanctioned blocks. */
  work?: string;
  jobCount?: number;
  assignments?: PlannerAssignment[];
  deferred?: DeferredJob[];
  departments?: string[];
  resources?: string[];
  affectedTrain?: string[];
  jobsAffected?: string[];
  reasonCodes?: ReasonCode[];
  explanations?: { what?: string; means?: string; remedy?: string };
  metrics?: PlannerMetrics;
  /** Where this payload came from — lets the UI show a "synthetic" hint. */
  source?: PlannerSource;
}

/* -------------------------------------------------------------------------- */
/* Metrics (backend-computed; synthetic fallback fills the same fields)       */
/* -------------------------------------------------------------------------- */

export interface PlannerMetrics {
  /** Windows in use by ≥1 assignment. */
  blocks?: number;
  jobs?: number;
  /** Total minutes of all proposed windows. */
  windowMinutes?: number;
  /** Union of occupied minutes (overlaps counted once — interval union). */
  occupiedMinutes?: number;
  unusedMinutes?: number;
  /** Occupied minutes ÷ total window minutes, 0–100. */
  utilization?: number;
  deferredCount?: number;
  /** Job count per tier, e.g. { 0: 1, 1: 2, 2: 2, 3: 1, 4: 2 }. */
  tierCoverage?: Record<string, number>;
  /* -------------------------- backend may add ---------------------------- */
  scheduled?: number;
  deferred?: number;
  possessionsUsed?: number;
  baselinePossessions?: number;
  possessionsSaved?: number;
  bundledJobs?: number;
  departmentsIntegrated?: string[];
  horizonFit?: number;
}

/* -------------------------------------------------------------------------- */
/* Top-level result                                                           */
/* -------------------------------------------------------------------------- */

/** Everything the Planning Workspace needs for one planning horizon. */
export interface PlannerResult {
  version?: string;
  date?: string;
  /** Solver verdict from the backend (OPTIMAL/FEASIBLE/INFEASIBLE/…). */
  status?: PlannerStatus;
  assignments: PlannerAssignment[];
  deferred: DeferredJob[];
  affectedTrain?: string[];
  trainImpact?: string[];
  resources?: string[];
  metrics?: PlannerMetrics;
  source: PlannerSource;
  /** INFEASIBLE diagnostics when the solver proved no schedule exists. */
  blockingConstraints?: string[];
  reasonCodes?: ReasonCode[];
  affectedJobs?: string[];
}

/* -------------------------------------------------------------------------- */
/* Simulation / replanning                                                    */
/* -------------------------------------------------------------------------- */

/** The operational events the backend replanner understands (§24). */
export type ReplanEventType =
  | "SPECIAL_TRAIN"
  | "TRAIN_CANCELLED"
  | "RESOURCE_FAILURE"
  | "EMERGENCY_JOB"
  | "WINDOW_REDUCED"
  | "WINDOW_WITHDRAWN"
  | "PRIORITY_CHANGE"
  | "OPERATIONAL_RESTRICTION";

export interface ReplanEvent {
  type: ReplanEventType;
  payload: Record<string, unknown>;
}

export interface ReplanResult {
  status: PlannerStatus;
  plan_version: string;
  trigger: string;
  changed_assignments: PlannerAssignment[];
  unchanged_assignments: PlannerAssignment[];
  newly_deferred_jobs: DeferredJob[];
  newly_scheduled_jobs: PlannerAssignment[];
  assignments: PlannerAssignment[];
  deferred_jobs: DeferredJob[];
  metrics: PlannerMetrics;
  train_impacts: string[];
  reason_codes: ReasonCode[];
  timestamp: string;
}

/* -------------------------------------------------------------------------- */
/* Governance                                                                 */
/* -------------------------------------------------------------------------- */

/** Backend approval lifecycle (§36). */
export type GovernanceStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "MODIFIED"
  | "REJECTED"
  | "LOCKED"
  | "STALE"
  | "INFEASIBLE";

export interface AuditEntry {
  entry_id: number;
  plan_id: string;
  plan_version: string;
  timestamp: string;
  officer: string;
  action: string;
  reason: string;
  affected_jobs: string[];
  event_trigger?: string | null;
}

export interface GovernedPlan {
  plan_id: string;
  plan_version: string;
  status: GovernanceStatus;
  created_at: string;
  updated_at: string;
  plan: Record<string, unknown>;
}
