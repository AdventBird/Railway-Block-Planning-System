// ---------------------------------------------------------------------------
// PLANNER SERVICE — Planning Workspace → real backend (POST /api/planner/run).
// ---------------------------------------------------------------------------
// All transport goes through ./client (§34). Behaviour:
//   • backend first: the plan shown in the Workspace IS the CP-SAT result;
//   • graceful fallback: when the backend is unreachable the seeded synthetic
//     dataset is used and the source banner says so — never a silent fake;
//   • every assignment / deferred row / metric rendered by the UI comes from
//     the payload normalised here.
// ---------------------------------------------------------------------------

import {
  blockWindows,
  corridorLabel,
  existingBlocks,
  PLAN_DATE,
  PLAN_VERSION,
  trains,
} from "../data/opsData";
import { jobById, jobs, type Job } from "../data/jobsData";
import {
  conflictEntries,
  conflictNext,
  recommendedPlan,
  type DeferredJob as SeedDeferredJob,
  type PlanAssignment,
  type ReasonCode,
} from "../data/planData";
import { planStats, spanMinutes } from "../lib/plan";
import { ENDPOINTS, ApiError, apiPost, isBackendConfigured } from "./client";
import type {
  DeferredJob,
  PlannerApiStatus,
  PlannerAssignment,
  PlannerMetrics,
  PlannerResult,
  PlannerSource,
  PlannerStatus,
  PlannerWindowStatus,
  ReplanEvent,
  ReplanResult,
  WindowDetails,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Source bookkeeping                                                         */
/* -------------------------------------------------------------------------- */

const syntheticSource = (message: string): PlannerSource => ({ status: "fallback", message });

const SYNTHETIC_SOURCE: PlannerSource = syntheticSource(
  "Synthetic planning dataset (backend not reachable)."
);

/** Last transport outcome — the UI may render a banner from it. */
let lastSource: PlannerSource = { status: "unknown" };

export function getPlannerApiStatus(): PlannerSource {
  return lastSource;
}

function setSource(status: PlannerApiStatus, endpoint?: string, message?: string): PlannerSource {
  lastSource = { status, endpoint, message };
  return lastSource;
}

/* -------------------------------------------------------------------------- */
/* Payload normalisation                                                      */
/* -------------------------------------------------------------------------- */

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  typeof value === "object" && value !== null ? (value as UnknownRecord) : {};

const pickText = (record: UnknownRecord, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
};

const pickNumber = (record: UnknownRecord, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const pickBoolean = (record: UnknownRecord, ...keys: string[]): boolean | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
};

const pickStringList = (record: UnknownRecord, ...keys: string[]): string[] | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const list = value.filter((item): item is string => typeof item === "string");
      if (list.length) return list;
    }
  }
  return undefined;
};

const pickReasonCodes = (record: UnknownRecord): ReasonCode[] | undefined => {
  const raw = record.reasonCodes ?? record.reason_codes ?? record.code;
  if (Array.isArray(raw)) {
    const list = raw.filter((item): item is string => typeof item === "string");
    return list.length ? (list as ReasonCode[]) : undefined;
  }
  return typeof raw === "string" ? [raw as ReasonCode] : undefined;
};

/** Accepts backend snake_case (`job_id`) or camelCase; drops unplaceable rows. */
function normalizeAssignments(payload: unknown): PlannerAssignment[] {
  if (!Array.isArray(payload)) return [];
  const out: PlannerAssignment[] = [];
  for (const entry of payload) {
    const record = asRecord(entry);
    const jobId = pickText(record, "jobId", "job_id");
    const windowId = pickText(record, "windowId", "window_id");
    const start = pickText(record, "start", "start_time");
    const end = pickText(record, "end", "end_time");
    if (!jobId || !windowId || !start || !end) continue;
    out.push({
      jobId,
      windowId,
      start,
      end,
      startMinutes: pickNumber(record, "start_minutes", "startMinutes"),
      endMinutes: pickNumber(record, "end_minutes", "endMinutes"),
      parallel: pickBoolean(record, "parallel"),
      note: pickText(record, "note"),
      possessionMinutes: pickNumber(record, "possession_minutes", "possessionMinutes"),
    });
  }
  return out;
}

function normalizeDeferredJobs(payload: unknown): DeferredJob[] {
  if (!Array.isArray(payload)) return [];
  const out: DeferredJob[] = [];
  for (const entry of payload) {
    const record = asRecord(entry);
    const jobId = pickText(record, "jobId", "job_id");
    if (!jobId) continue;
    const codes = pickReasonCodes(record);
    out.push({
      jobId,
      code: codes?.[0] ?? "LOWER_PRIORITY",
      reason: pickText(record, "reason", "explanation") ?? "Deferred by the planner.",
      reasonCodes: codes,
      blockingConstraints: pickStringList(record, "blocking_constraints", "blockingConstraints"),
    });
  }
  return out;
}

/** INFEASIBLE diagnostics travel on the planner payload. */
function normalizeInfeasible(record: UnknownRecord, result: PlannerResult): void {
  result.status = (pickText(record, "status") as PlannerStatus | undefined) ?? result.status;
  const blocking = pickStringList(record, "blocking_constraints", "blockingConstraints");
  if (blocking?.length) result.blockingConstraints = blocking;
  const codes = pickReasonCodes(record);
  if (codes?.length) result.reasonCodes = codes;
  const affected = pickStringList(record, "affected_jobs", "affectedJobs");
  if (affected?.length) result.affectedJobs = affected;
}

/* -------------------------------------------------------------------------- */
/* Enrichment — job context from the seeded catalogue (display only)          */
/* -------------------------------------------------------------------------- */

const seedAssignmentContext = (
  jobId: string
): Pick<PlannerAssignment, "title" | "department" | "tier" | "corridorId" | "minutes" | "resources"> => {
  const job = jobById(jobId);
  return {
    title: job?.title,
    department: job?.dept,
    tier: job?.tier,
    corridorId: job?.corridorId,
    minutes: job?.minutes,
    resources: job ? [...job.resources] : undefined,
  };
};

/** Add title / tier / department / resources to assignments from either source. */
function enrichAssignments(list: PlannerAssignment[]): PlannerAssignment[] {
  return list.map((assignment) => ({ ...seedAssignmentContext(assignment.jobId), ...assignment }));
}

/** Add title / tier / explanation / next opportunity to deferred rows. */
function enrichDeferred(list: DeferredJob[]): DeferredJob[] {
  return list.map((entry) => {
    const job: Job | undefined = jobById(entry.jobId);
    const narration = conflictEntries.find(
      (conflict) => conflict.code === entry.code && conflict.subject.startsWith(entry.jobId)
    );
    const codes = entry.reasonCodes ?? [entry.code];
    return {
      ...entry,
      title: entry.title ?? job?.title,
      department: entry.department ?? job?.dept,
      tier: entry.tier ?? job?.tier,
      corridorId: entry.corridorId ?? job?.corridorId,
      minutes: entry.minutes ?? job?.minutes,
      resources: entry.resources ?? (job ? [...job.resources] : undefined),
      reasonCodes: codes,
      explanations:
        entry.explanations ??
        (narration
          ? { what: narration.what, means: narration.means, remedy: narration.remedy }
          : undefined),
      nextFeasibleWindow: entry.nextFeasibleWindow ?? conflictNext[entry.jobId],
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Derived metrics (same arithmetic for backend + synthetic plans)            */
/* -------------------------------------------------------------------------- */

function tierCoverage(): Record<string, number> {
  const coverage: Record<string, number> = {};
  jobs.forEach((job) => {
    const key = String(job.tier);
    coverage[key] = (coverage[key] ?? 0) + 1;
  });
  return coverage;
}

/** Plan-level metrics for any assignment set (backend or synthetic). */
function deriveMetrics(scheduled: PlanAssignment[], deferredCount: number): PlannerMetrics {
  const stats = planStats(
    blockWindows.map((window) => ({ id: window.id, minutes: window.minutes })),
    scheduled
  );
  const maintained = new Set(scheduled.map((assignment) => assignment.jobId));
  return {
    blocks: stats.blocks,
    jobs: stats.jobs,
    windowMinutes: stats.windowMinutes,
    occupiedMinutes: stats.occupiedMinutes,
    unusedMinutes: stats.unusedMinutes,
    utilization: stats.utilization,
    deferredCount,
    tierCoverage: tierCoverage(),
    horizonFit: jobs.length ? Math.round((maintained.size / jobs.length) * 100) : 0,
  };
}

const toPlanAssignments = (list: PlannerAssignment[]): PlanAssignment[] =>
  list.map((assignment) => ({
    jobId: assignment.jobId,
    windowId: assignment.windowId,
    start: assignment.start,
    end: assignment.end,
    parallel: assignment.parallel,
    note: assignment.note,
  }));

/** The window a deferred job belongs to, if the plan places the job at all. */
function windowIdOfJob(jobId: string, scheduled: PlanAssignment[]): string | undefined {
  return scheduled.find((assignment) => assignment.jobId === jobId)?.windowId;
}

/**
 * Corridor a window belongs to — proposed windows from `blockWindows`,
 * sanctioned blocks from `existingBlocks` (same two sources the timeline uses).
 */
function corridorOfWindow(windowId: string): string | undefined {
  const proposed = blockWindows.find((window) => window.id === windowId);
  if (proposed) return proposed.corridorId;
  return existingBlocks.find((block) => block.id === windowId)?.corridorId;
}

/** Seed rows are already strongly typed — this only re-orders/normalises keys. */
function seedDeferred(): DeferredJob[] {
  return recommendedPlan.deferred.map((entry: SeedDeferredJob) => ({
    jobId: entry.jobId,
    code: entry.code,
    reason: entry.reason,
  }));
}

/* -------------------------------------------------------------------------- */
/* Synthetic builders — the fallback path (reuses existing seed exports)      */
/* -------------------------------------------------------------------------- */

/** Build the synthetic planner result directly from the seed modules. */
export function buildSyntheticPlannerResult(
  source: PlannerSource = SYNTHETIC_SOURCE
): PlannerResult {
  const scheduled: PlanAssignment[] = recommendedPlan.assignments.map((assignment) => ({
    ...assignment,
  }));
  return {
    version: recommendedPlan.version,
    date: recommendedPlan.date,
    status: "FEASIBLE",
    assignments: enrichAssignments(scheduled),
    deferred: enrichDeferred(seedDeferred()),
    trainImpact: [...recommendedPlan.trainImpact],
    resources: [...recommendedPlan.resources],
    metrics: deriveMetrics(scheduled, recommendedPlan.deferred.length),
    source,
  };
}

/** Build canonical window detail (proposed window or sanctioned block). */
export function buildSyntheticWindowDetails(
  windowId: string,
  source: PlannerSource = SYNTHETIC_SOURCE
): WindowDetails {
  const proposed = blockWindows.find((window) => window.id === windowId);
  const block = existingBlocks.find((entry) => entry.id === windowId);
  const target = proposed ?? block;
  const corridorId = target?.corridorId ?? "C1";
  const minutes = proposed
    ? proposed.minutes
    : block
      ? spanMinutes(block.start, block.end)
      : 0;
  const rawAssignments = recommendedPlan.assignments.filter(
    (assignment) => assignment.windowId === windowId
  );
  const assignments = enrichAssignments(rawAssignments.map((assignment) => ({ ...assignment })));
  const deferred = enrichDeferred(seedDeferred()).filter(
    (entry) => entry.corridorId === corridorId
  );
  const departments = [...new Set(assignments.map((a) => a.department ?? "").filter(Boolean))];
  const resources = [...new Set(assignments.flatMap((a) => a.resources ?? []))];

  const status: PlannerWindowStatus | undefined = proposed
    ? "proposed"
    : block
      ? block.status
      : undefined;

  return {
    windowId: proposed ? proposed.id : block?.id ?? windowId,
    label: proposed ? proposed.id : block?.blockId,
    blockId: block?.blockId,
    corridorId,
    corridorLabel: corridorLabel(corridorId),
    start: target?.start ?? "00:00",
    end: target?.end ?? "00:00",
    minutes,
    status,
    note: proposed?.note,
    work: block?.work,
    jobCount: rawAssignments.length,
    assignments,
    deferred,
    departments,
    resources,
    affectedTrain: [...recommendedPlan.trainImpact],
    jobsAffected: assignments.map((assignment) => assignment.jobId),
    reasonCodes: [...new Set(deferred.map((entry) => entry.code))],
    metrics: deriveMetrics(rawAssignments, deferred.length),
    source,
  };
}

/* -------------------------------------------------------------------------- */
/* Public service — backend first, synthetic fallback, never throws           */
/* -------------------------------------------------------------------------- */

function isPlannerPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { assignments?: unknown; status?: unknown };
  return Array.isArray(candidate.assignments) && typeof candidate.status === "string";
}

/**
 * getPlannerResult()
 * Runs the REAL CP-SAT planner (POST /api/planner/run). When the backend is
 * unreachable, resolves to the synthetic plan with a fallback source marker.
 * Never rejects — the UI decides how to render `source`.
 */
export async function getPlannerResult(): Promise<PlannerResult> {
  const endpoint = ENDPOINTS.plannerRun;
  if (isBackendConfigured()) {
    try {
      const payload = await apiPost<unknown>(endpoint, { mode: "BALANCED" });
      if (isPlannerPayload(payload)) {
        const record = asRecord(payload);
        const assignments = normalizeAssignments(record.assignments);
        const deferred = enrichDeferred(normalizeDeferredJobs(record.deferred_jobs ?? record.deferred));
        const result: PlannerResult = {
          version: pickText(record, "plan_version", "version") ?? PLAN_VERSION,
          date: PLAN_DATE,
          status: (pickText(record, "status") as PlannerStatus | undefined) ?? "FEASIBLE",
          assignments: enrichAssignments(assignments),
          deferred,
          trainImpact:
            pickStringList(record, "train_impact", "trainImpact") ?? [],
          resources: pickStringList(record, "resources") ?? [],
          metrics: deriveMetrics(toPlanAssignments(assignments), deferred.length),
          source: setSource("live", endpoint),
        };
        if (result.status === "INFEASIBLE") normalizeInfeasible(record, result);
        // Backend metric pass-through (interval-union arithmetic owned there).
        const metricsRecord = asRecord(record.metrics);
        if (metricsRecord["occupied_minutes"] !== undefined) {
          result.metrics = {
            ...result.metrics,
            occupiedMinutes: pickNumber(metricsRecord, "occupied_minutes"),
            blocks: pickNumber(metricsRecord, "blocks"),
            scheduled: pickNumber(metricsRecord, "scheduled"),
            deferred: pickNumber(metricsRecord, "deferred"),
            utilization: pickNumber(metricsRecord, "utilization"),
          };
        }
        return result;
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `Backend planner unavailable — synthetic dataset in use. (${error.code})`
          : "Backend planner unavailable — synthetic dataset in use.";
      setSource("fallback", endpoint, message);
      return buildSyntheticPlannerResult({ status: "fallback", endpoint, message });
    }
  }
  const message = isBackendConfigured()
    ? "Backend planner unavailable — synthetic dataset in use."
    : "No backend configured — synthetic dataset in use.";
  setSource("fallback", endpoint, message);
  return buildSyntheticPlannerResult({ status: "fallback", endpoint, message });
}

/**
 * getDeferredJobs()
 * Derived from the planner result (backend-owned reason codes); falls back to
 * the seeded explanation rows only when the backend is unreachable.
 */
export async function getDeferredJobs(): Promise<DeferredJob[]> {
  const result = await getPlannerResult();
  if (result.source.status === "live") return result.deferred;
  return enrichDeferred(seedDeferred());
}

/**
 * getWindowDetails(windowId)
 * Window detail is derived from the real plan (assignments in that window)
 * when the backend is live; synthetic detail otherwise.
 */
export async function getWindowDetails(windowId: string): Promise<WindowDetails> {
  const id = windowId.trim();
  const result = await getPlannerResult();
  const source = result.source;

  const base =
    source.status === "live"
      ? buildSyntheticWindowDetails(id, { status: "live" })
      : buildSyntheticWindowDetails(id, source);

  if (!id) return base;

  if (source.status === "live") {
    const rawAssignments = result.assignments.filter((a) => a.windowId === id);
    if (rawAssignments.length) {
      const departments = [
        ...new Set(rawAssignments.map((a) => a.department ?? "").filter(Boolean)),
      ];
      const resources = [...new Set(rawAssignments.flatMap((a) => a.resources ?? []))];
      const corridorId =
        corridorOfWindow(id) ?? rawAssignments[0].corridorId ?? base.corridorId;
      return {
        ...base,
        windowId: id,
        corridorId,
        corridorLabel: corridorLabel(corridorId),
        jobCount: rawAssignments.length,
        assignments: enrichAssignments(rawAssignments),
        deferred: result.deferred.filter((entry) => entry.corridorId === corridorId),
        departments,
        resources,
        jobsAffected: rawAssignments.map((assignment) => assignment.jobId),
        metrics: deriveMetrics(toPlanAssignments(rawAssignments), result.deferred.length),
        source,
      };
    }
  }
  return base;
}

/* -------------------------------------------------------------------------- */
/* Replanning (simulation → backend)                                          */
/* -------------------------------------------------------------------------- */

/**
 * runReplan()
 * POST /api/replan — the simulation screen shows BEFORE (current plan) /
 * EVENT / AFTER (real CP-SAT replan). Throws ApiError; the caller renders it.
 */
export async function runReplan(
  event: ReplanEvent,
  currentPlan?: Record<string, unknown>,
  lockedAssignments?: Record<string, string>
): Promise<ReplanResult> {
  const payload = await apiPost<unknown>(ENDPOINTS.replan, {
    event,
    current_plan: currentPlan,
    locked_assignments: lockedAssignments ?? {},
  });
  const record = asRecord(payload);
  return {
    status: (pickText(record, "status") as PlannerStatus) ?? "FEASIBLE",
    plan_version: pickText(record, "plan_version") ?? "r2",
    trigger: pickText(record, "trigger") ?? event.type,
    changed_assignments: normalizeAssignments(record.changed_assignments),
    unchanged_assignments: normalizeAssignments(record.unchanged_assignments),
    newly_deferred_jobs: normalizeDeferredJobs(record.newly_deferred_jobs),
    newly_scheduled_jobs: normalizeAssignments(record.newly_scheduled_jobs),
    assignments: normalizeAssignments(record.assignments),
    deferred_jobs: normalizeDeferredJobs(record.deferred_jobs),
    metrics: asRecord(record.metrics) as PlannerMetrics,
    train_impacts: pickStringList(record, "train_impacts", "trainImpacts") ?? [],
    reason_codes: (pickReasonCodes(record) ?? []) as ReplanResult["reason_codes"],
    timestamp: pickText(record, "timestamp") ?? new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Small read-only helpers kept for the existing UI imports                   */
/* -------------------------------------------------------------------------- */

export type { DeferredJob, PlannerAssignment, WindowDetails } from "./types";

/** Window a job is scheduled in per the seed plan (synthetic fallback view). */
export function scheduledWindowOf(jobId: string): string | undefined {
  return windowIdOfJob(jobId, recommendedPlan.assignments);
}

/** Corridor that owns a window id — exposed for the eventual UI filters. */
export function corridorOfPlannerWindow(windowId: string): string | undefined {
  return corridorOfWindow(windowId);
}

/** Corridor catalogue, so the UI never has to import opsData for filter options. */
export function plannerCorridors(): { id: string; label: string; line: string }[] {
  const corridors: { id: string; label: string; line: string }[] = [];
  for (const window of blockWindows) {
    if (!corridors.some((c) => c.id === window.corridorId)) {
      corridors.push({
        id: window.corridorId,
        label: corridorLabel(window.corridorId),
        line: "UP",
      });
    }
  }
  return corridors;
}

/** Total proposed window minutes — one number the future dashboard reads. */
export function totalProposedWindowMinutes(): number {
  return blockWindows.reduce((total, window) => total + window.minutes, 0);
}

/* -------------------------------------------------------------------------- */
/* Feature 23 — deferral explanation support ("Why wasn't this scheduled?")   */
/* -------------------------------------------------------------------------- */

/** A train movement that shares the corridor/window of a deferred job. */
export interface AffectedTrain {
  id: string;
  number: string;
  name: string;
  type: string;
  start: string;
  end: string;
  note?: string;
}

/**
 * Minutes of a job inside [start, end) on a circular 24 h clock — local copy of
 * the same rule lib/plan.spanMinutes uses (that module is not modified here).
 */
function minutesWithin(start: string, end: string): number {
  const toMin = (t: string): number => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return (((toMin(end) - toMin(start)) % 1440) + 1440) % 1440;
}

/** Two intervals share at least a minute (both treated as circular). */
function spansOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const toMin = (t: string): number => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const on = (t: number): number => (t < 720 ? t + 1440 : t); // 22:00 → 08:00 horizon
  const a1 = on(toMin(aStart));
  const a2 = a1 + minutesWithin(aStart, aEnd);
  const b1 = on(toMin(bStart));
  const b2 = b1 + minutesWithin(bStart, bEnd);
  return a1 < b2 && b1 < a2;
}

/**
 * The window a deferred job was aimed at: the window it is already assigned to,
 * else the first proposed window on its corridor that is long enough.
 * Returns `null` when the plan has no such window — the UI then hides the row.
 */
export function attemptedWindowOf(job: Job | undefined, scheduled: PlanAssignment[]): string | null {
  if (!job) return null;
  const assigned = scheduled.find((assignment) => assignment.jobId === job.id)?.windowId;
  if (assigned) return assigned;
  const candidate = blockWindows.find(
    (window) => window.corridorId === job.corridorId && window.minutes >= job.minutes
  );
  return candidate ? candidate.id : null;
}

/**
 * Train movements inside the same corridor as a deferred job, optionally
 * narrowed to those overlapping the window it was aimed at.
 */
export function affectedTrainsOf(
  corridorId: string | undefined,
  windowId: string | null
): AffectedTrain[] {
  if (!corridorId) return [];
  const window = windowId
    ? blockWindows.find((entry) => entry.id === windowId) ??
      existingBlocks.find((entry) => entry.id === windowId)
    : undefined;
  return trains
    .filter((train) => train.corridorId === corridorId)
    .filter((train) =>
      window ? spansOverlap(train.start, train.end, window.start, window.end) : true
    )
    .map((train) => ({
      id: train.id,
      number: train.number,
      name: train.name,
      type: train.type,
      start: train.start,
      end: train.end,
      note: train.note,
    }));
}

/** Re-export so screens can import the status type from one module. */
export type { PlannerApiStatus } from "./types";
