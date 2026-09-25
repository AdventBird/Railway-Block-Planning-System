// ---------------------------------------------------------------------------
// PLANNER API SERVICE (frontend-only, backend-ready)
// ---------------------------------------------------------------------------
// This is the ONLY module in the app allowed to call fetch(). The UI never
// talks to a backend directly: every screen keeps reading the same shapes it
// reads today, so FastAPI (Person 1 / Person 3) can be wired later WITHOUT
// touching any Workspace component.
//
// Guarantees:
//   • backend first, synthetic data as automatic fallback;
//   • never throws — every failure resolves to a typed synthetic payload;
//   • no uncaught promise errors and no console spam (at most one warning
//     per endpoint per session);
//   • the synthetic dataset is NOT duplicated — it is consumed from the
//     existing exports of src/data/opsData.ts, jobsData.ts and planData.ts,
//     and all arithmetic comes from src/lib/plan.ts (read-only).
//
// Backend endpoints this layer is ready for (none required today):
//   GET /api/planner        → PlannerResult
//   GET /api/deferred       → DeferredJob[]
//   GET /api/windows/:id    → WindowDetails
//
// Configure the base URL with VITE_PLANNER_API_URL, or at runtime with
// setPlannerBaseUrl("http://127.0.0.1:8000"). With no base URL configured the
// service resolves to synthetic data immediately and never performs I/O.
// ---------------------------------------------------------------------------

import {
  blockWindows,
  corridorLabel,
  corridors,
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
import type {
  DeferredJob,
  PlannerAssignment,
  PlannerMetrics,
  PlannerResult,
  PlannerSource,
  PlannerWindowStatus,
  WindowDetails,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

const ENV_BASE_URL: string =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env === "object" &&
  typeof (import.meta.env as Record<string, unknown>).VITE_PLANNER_API_URL === "string"
    ? ((import.meta.env as Record<string, unknown>).VITE_PLANNER_API_URL as string)
    : "";

const REQUEST_TIMEOUT_MS = 6000;

/** Endpoints this service may call — kept here so the UI never builds URLs. */
export const PLANNER_ENDPOINTS = {
  result: "/api/planner",
  deferred: "/api/deferred",
  window: (windowId: string): string => `/api/windows/${encodeURIComponent(windowId)}`,
} as const;

let baseUrlCache: string | null = null;

/** Resolve the configured backend base URL (empty string ⇒ synthetic only). */
export function plannerBaseUrl(): string {
  const configured = baseUrlCache ?? ENV_BASE_URL;
  return configured.trim().replace(/\/+$/, "");
}

/** Runtime override — lets a later integration point inject a backend host. */
export function setPlannerBaseUrl(baseUrl: string | null): void {
  baseUrlCache = baseUrl ?? "";
}

/** True once a backend base URL is configured. */
export function isPlannerBackendConfigured(): boolean {
  return plannerBaseUrl().length > 0;
}

const syntheticSource = (message: string): PlannerSource => ({ status: "fallback", message });

const SYNTHETIC_SOURCE: PlannerSource = syntheticSource(
  "Synthetic planning dataset (no backend configured)."
);
const FALLBACK_SOURCE: PlannerSource = syntheticSource(
  "Planner backend unavailable — synthetic dataset in use."
);

/* -------------------------------------------------------------------------- */
/* Transport — the only fetch() in the application                            */
/* -------------------------------------------------------------------------- */

/** One warning per endpoint per session, so a dead backend never spams. */
const warnedEndpoints = new Set<string>();

function warnOnce(endpoint: string, reason: string): void {
  if (warnedEndpoints.has(endpoint)) return;
  warnedEndpoints.add(endpoint);
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[planner] ${endpoint} unavailable (${reason}) — using synthetic data.`);
  }
}

/** Returns `null` for every failure: offline, 404, non-2xx, timeout, bad JSON. */
async function fetchJson<T>(endpoint: string): Promise<T | null> {
  const base = plannerBaseUrl();
  if (!base || typeof fetch !== "function") return null;

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetch(`${base}${endpoint}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined,
    });
    if (!response || !response.ok) {
      warnOnce(endpoint, response ? `HTTP ${response.status}` : "no response");
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    warnOnce(endpoint, error instanceof Error ? error.name : "network error");
    return null;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/**
 * Minimal shape validation. A backend may return a subset of the contract,
 * but the two arrays the plan is built from must actually be arrays.
 */
function isPlannerResultPayload(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { assignments?: unknown; deferred?: unknown };
  if (!Array.isArray(candidate.assignments)) return false;
  return candidate.deferred === undefined || Array.isArray(candidate.deferred);
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

/**
 * Accepts backend snake_case (`job_id`) or the existing camelCase, and drops
 * rows that cannot be placed in the plan at all.
 */
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
      parallel: pickBoolean(record, "parallel"),
      note: pickText(record, "note"),
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
    });
  }
  return out;
}


/* -------------------------------------------------------------------------- */
/* Enrichment — add job context that either source can resolve                */
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
/* Derived metrics (arithmetic comes from lib/plan.ts — read-only)            */
/* -------------------------------------------------------------------------- */

function tierCoverage(): Record<string, number> {
  const coverage: Record<string, number> = {};
  jobs.forEach((job) => {
    const key = String(job.tier);
    coverage[key] = (coverage[key] ?? 0) + 1;
  });
  return coverage;
}

/** Plan-level metrics for any assignment set (synthetic or backend). */
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
/* Synthetic builders — the fallback path (reuses existing exports, never     */
/* re-declares the dataset)                                                   */
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
/* Public service — the three entry points the UI will later consume           */
/* -------------------------------------------------------------------------- */

const toPlanAssignments = (list: PlannerAssignment[]): PlanAssignment[] =>
  list.map((assignment) => ({
    jobId: assignment.jobId,
    windowId: assignment.windowId,
    start: assignment.start,
    end: assignment.end,
    parallel: assignment.parallel,
    note: assignment.note,
  }));

/**
 * getPlannerResult()
 * Backend first (GET /api/planner), else the synthetic recommended plan.
 * Never rejects and never throws.
 */
export async function getPlannerResult(): Promise<PlannerResult> {
  const endpoint = PLANNER_ENDPOINTS.result;
  try {
    const payload = await fetchJson<unknown>(endpoint);
    if (payload !== null && isPlannerResultPayload(payload)) {
      const record = asRecord(payload);
      const assignments = normalizeAssignments(record.assignments);
      const deferred = enrichDeferred(normalizeDeferredJobs(record.deferred));
      return {
        version: pickText(record, "version") ?? PLAN_VERSION,
        date: pickText(record, "date") ?? PLAN_DATE,
        assignments: enrichAssignments(assignments),
        deferred,
        trainImpact:
          pickStringList(record, "trainImpact", "train_impact", "affectedTrain") ??
          [...recommendedPlan.trainImpact],
        resources: pickStringList(record, "resources") ?? [...recommendedPlan.resources],
        metrics: deriveMetrics(toPlanAssignments(assignments), deferred.length),
        source: { status: "live", endpoint },
      };
    }
  } catch (error) {
    // Defensive: fetchJson already swallows failures — never let the UI break.
    warnOnce(endpoint, error instanceof Error ? error.name : "unexpected error");
  }
  return buildSyntheticPlannerResult(
    isPlannerBackendConfigured() ? FALLBACK_SOURCE : SYNTHETIC_SOURCE
  );
}

/**
 * getDeferredJobs()
 * Backend first (GET /api/deferred), then the planner result, then synthetic.
 * Rows are always enriched with title / tier / explanation so a "Why?" panel
 * works identically for backend and synthetic data.
 */
export async function getDeferredJobs(): Promise<DeferredJob[]> {
  const endpoint = PLANNER_ENDPOINTS.deferred;
  try {
    const payload = await fetchJson<unknown>(endpoint);
    if (payload !== null) {
      const rows = Array.isArray(payload)
        ? normalizeDeferredJobs(payload)
        : normalizeDeferredJobs(asRecord(payload).deferred);
      // 200 with an empty list is a valid answer — report it as-is.
      if (rows.length) return enrichDeferred(rows);
      if (Array.isArray(payload)) return [];
    }
  } catch (error) {
    warnOnce(endpoint, error instanceof Error ? error.name : "unexpected error");
  }
  try {
    const result = await getPlannerResult();
    return result.deferred;
  } catch {
    return enrichDeferred(seedDeferred());
  }
}


/**
 * getWindowDetails(windowId)
 * Backend first (GET /api/windows/:id), else the synthetic window/block record.
 * Accepts proposed windows (W1…W3) and sanctioned blocks (E1…E3).
 * An empty id resolves to the synthetic default and performs no I/O.
 */
export async function getWindowDetails(windowId: string): Promise<WindowDetails> {
  const id = windowId.trim();
  if (!id) return buildSyntheticWindowDetails("W1");

  const endpoint = PLANNER_ENDPOINTS.window(id);
  try {
    const payload = await fetchJson<unknown>(endpoint);
    if (payload !== null && typeof payload === "object") {
      const record = asRecord(payload);
      const resolvedId = pickText(record, "windowId", "window_id", "id") ?? id;
      const base = buildSyntheticWindowDetails(resolvedId); // corridor/minutes skeleton
      const assignments = normalizeAssignments(record.assignments);
      const deferred = enrichDeferred(normalizeDeferredJobs(record.deferred));
      return {
        ...base,
        windowId: resolvedId,
        start: pickText(record, "start", "start_time") ?? base.start,
        end: pickText(record, "end", "end_time") ?? base.end,
        status: (pickText(record, "status") as PlannerWindowStatus | undefined) ?? base.status,
        note: pickText(record, "note") ?? base.note,
        work: pickText(record, "work") ?? base.work,
        jobCount: assignments.length || base.jobCount,
        assignments: assignments.length ? enrichAssignments(assignments) : base.assignments,
        deferred: deferred.length ? deferred : base.deferred,
        departments: pickStringList(record, "departments") ?? base.departments,
        resources: pickStringList(record, "resources") ?? base.resources,
        affectedTrain:
          pickStringList(record, "affectedTrain", "train_impact", "affected_train") ??
          base.affectedTrain,
        metrics: deriveMetrics(toPlanAssignments(assignments), deferred.length),
        source: { status: "live", endpoint },
      };
    }
  } catch (error) {
    warnOnce(endpoint, error instanceof Error ? error.name : "unexpected error");
  }
  return buildSyntheticWindowDetails(id);
}

/* -------------------------------------------------------------------------- */
/* Small read-only helpers for the future UI integration layer                */
/* -------------------------------------------------------------------------- */

/** Latest transport status — optional source of a "synthetic data" banner. */
export function getPlannerApiStatus(): PlannerSource {
  return isPlannerBackendConfigured()
    ? { status: "fallback", endpoint: PLANNER_ENDPOINTS.result, message: FALLBACK_SOURCE.message }
    : SYNTHETIC_SOURCE;
}

/** Window a job is scheduled in, if the plan places it at all. */
export function scheduledWindowOf(jobId: string): string | undefined {
  return windowIdOfJob(jobId, recommendedPlan.assignments);
}

/** Corridor that owns a window id — exposed for the eventual UI filters. */
export function corridorOfPlannerWindow(windowId: string): string | undefined {
  return corridorOfWindow(windowId);
}

/** Corridor catalogue, so the UI never has to import opsData for filter options. */
export function plannerCorridors(): { id: string; label: string; line: string }[] {
  return corridors.map((corridor) => ({ ...corridor }));
}

/** Total proposed window minutes — one number the future dashboard reads. */
export function totalProposedWindowMinutes(): number {
  return blockWindows.reduce((total, window) => total + window.minutes, 0);
}

/* -------------------------------------------------------------------------- */
/* Feature 23 — deferral explanation support ("Why wasn't this scheduled?")    */
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

/** Re-exported so the UI can type deferrals/assignments/windows from the API layer alone. */
export type { DeferredJob, PlannerAssignment, WindowDetails };

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

