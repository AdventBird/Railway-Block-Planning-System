// ---------------------------------------------------------------------------
// Planner API contract — the shapes the Planning Workspace consumes.
// ---------------------------------------------------------------------------
// These types are deliberately backend-ready: every field the future planner
// API may serve is present, and anything only the synthetic dataset can answer
// today is OPTIONAL so a real response may omit it.
//
// Rules kept from the Phase 1 audit:
//   • no AI / confidence score fields — priority is Tier 0–4 only;
//   • project terminology only (tier, reason code, corridor, window, block);
//   • both snake_case (backend payload convention, e.g. `job_id`) and the
//     camelCase used by the existing data files are accepted — the service
//     normalises either form before it reaches the UI;
//   • nothing here is imported by the UI yet — this is an additive seam.
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

/* -------------------------------------------------------------------------- */
/* Response status                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Health of the planner service for one call.
 *   "live"     → served by a backend this call;
 *   "fallback" → backend absent / unreachable / invalid → synthetic data used;
 *   "unknown"  → before the first call resolves.
 * The UI can render a banner from `message` without knowing transport details.
 */
export type PlannerApiStatus = "live" | "fallback" | "unknown";

/** Where a resolved payload actually came from. */
export interface PlannerSource {
  status: PlannerApiStatus;
  /** Endpoint that was attempted, e.g. "/api/planner". */
  endpoint?: string;
  /** Plain-language reason the fallback was used (safe to show an officer). */
  message?: string;
}

/* -------------------------------------------------------------------------- */
/* Assignments & deferrals                                                    */
/* -------------------------------------------------------------------------- */

/** One job placed inside a window (or an already-sanctioned block). */
export interface PlannerAssignment {
  /** e.g. "J-02" — backend may send `job_id`. */
  jobId: string;
  /** e.g. "W1" … "E3" — backend may send `window_id`. */
  windowId: string;
  start: string;
  end: string;
  parallel?: boolean;
  note?: string;
  /* ---------------- context added by the frontend service ---------------- */
  title?: string;
  department?: PlannerDepartment | string;
  tier?: PlannerTier;
  corridorId?: string;
  /** Duration the job itself needs, independent of the window it sits in. */
  minutes?: number;
  resources?: string[];
}

/** A job the planner could not place, with a plain-language cause. */
export interface DeferredJob {
  jobId: string;
  code: ReasonCode;
  /** Human-readable deferral explanation. */
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
/* Metrics (future-ready)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Derived plan arithmetic. The synthetic fallback fills every field from
 * `lib/plan.ts`; a backend may return a subset, so most fields are optional.
 */
export interface PlannerMetrics {
  /** Windows in use by ≥1 assignment. */
  blocks?: number;
  jobs?: number;
  /** Total minutes of all proposed windows. */
  windowMinutes?: number;
  /** Union of occupied minutes (overlaps counted once). */
  occupiedMinutes?: number;
  unusedMinutes?: number;
  /** Occupied minutes ÷ total window minutes, 0–100. */
  utilization?: number;
  deferredCount?: number;
  /** Job count per tier, e.g. { 0: 1, 1: 2, 2: 2, 3: 1, 4: 2 }. */
  tierCoverage?: Record<string, number>;
  /* -------------------------- backend may add later ---------------------- */
  plannedBlocks?: number;
  plannedMinutes?: number;
  /** Percentage of jobs held inside the maintenance horizon. */
  horizonFit?: number;
  projectedUtilization?: number;
  utilizationTrend?: number[];
  assetAvailability?: { name: string; avail: number; note: string }[];
}

/* -------------------------------------------------------------------------- */
/* Top-level result                                                           */
/* -------------------------------------------------------------------------- */

/** Everything the Planning Workspace needs for one planning horizon. */
export interface PlannerResult {
  version?: string;
  date?: string;
  assignments: PlannerAssignment[];
  deferred: DeferredJob[];
  affectedTrain?: string[];
  trainImpact?: string[];
  resources?: string[];
  metrics?: PlannerMetrics;
  source: PlannerSource;
}
