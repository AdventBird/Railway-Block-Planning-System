// ---------------------------------------------------------------------------
// PLANNING WORKSPACE — the most important screen (§9).
// Header (Tonight / Week / Month) · LEFT: work to schedule · CENTER: railway
// timeline · RIGHT: recommended block plan · BOTTOM: deferred & conflicts.
// Re-plan: every assignment, deferral and metric comes from the planner API
// result (GET via getPlannerResult); "Generate Plan" re-runs the backend.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Chip, TierChip, CompatChip, ReasonChip, DeptChip, Button, OK, OK_BG, PRIMARY, PRIMARY_SOFT, WARN, WARN_BG, type ViewId } from "./ui";
import { JobDrawer, WindowDrawer, TrainDrawer, CompatDrawer, ConflictDrawer, ReasonDrawer, type WinRef } from "./drawers";
import { WeekView, MonthView } from "./PlanningCalendar";
import { Timeline, TimelineLegend, buildPlanLanes, corridorOfWindowId, type TimelineBar } from "./Timeline";
import { UtilBar } from "./TimelineUtil";
import { blockWindows, corridorLabel, existingBlocks, PLAN_DATE } from "../data/opsData";
import { seedJobOfBackendId, seedWindowOfBackendId } from "../data/idMap";
import { compatGroups, jobById, jobs, type Job } from "../data/jobsData";
import { conflictEntries, recommendedPlan, type ReasonCode } from "../data/planData";
import { occupiedUnion, spanMinutes, type PlanStats } from "../lib/plan";
import {
  affectedTrainsOf,
  attemptedWindowOf,
  getDeferredJobs,
  getPlannerApiStatus,
  getPlannerResult,
  getWindowDetails,
  type AffectedTrain,
  type DeferredJob,
  type PlannerAssignment,
  type WindowDetails,
} from "../api/planner";
import { apiBaseUrl } from "../api/client";
import type { PlannerResult } from "../api/types";
import {
  PlanningQualityDashboard,
  buildQualityMetricsFromPlan,
  type PlannerQualityMetrics,
} from "./PlannerKpiCard";

/** Deferred-job filter chips — every option filters on `reasonCodes` and `tier`. */
type DeferralFilter =
  | "all"
  | "priority"
  | "train"
  | "resource"
  | "isolation"
  | "incompatible";

const DEFER_FILTERS: { id: DeferralFilter; label: string }[] = [
  { id: "all", label: "All Deferred" },
  { id: "priority", label: "Safety/Priority" },
  { id: "train", label: "Train Conflict" },
  { id: "resource", label: "Resource Conflict" },
  { id: "isolation", label: "Isolation" },
  { id: "incompatible", label: "Incompatible" },
];

const codesOf = (row: DeferredJob): (ReasonCode | string)[] => {
  const list = row.reasonCodes?.length ? row.reasonCodes : [row.code];
  return list.map((c) => String(c));
};

function matchesDeferralFilter(row: DeferredJob, filter: DeferralFilter): boolean {
  if (filter === "all") return true;
  const codes = codesOf(row);
  switch (filter) {
    case "priority": {
      // Safety/Priority: return only jobs that belong to Tier 0, Tier 1, or Tier 2 (no numerical scores exposed)
      const tier = row.tier ?? jobById(row.jobId)?.tier;
      return tier !== undefined && tier >= 0 && tier <= 2;
    }
    case "train":
      // Train Conflict: return jobs containing TRAIN_CONFLICT or PROTECTED_MOVEMENT_CONFLICT
      return codes.includes("TRAIN_CONFLICT") || codes.includes("PROTECTED_MOVEMENT_CONFLICT");
    case "resource":
      // Resource Conflict: return jobs containing RESOURCE_CONFLICT
      return codes.includes("RESOURCE_CONFLICT");
    case "isolation":
      // Isolation: return jobs containing ISOLATION_CONFLICT
      return codes.includes("ISOLATION_CONFLICT");
    case "incompatible":
      // Incompatible: return jobs containing INCOMPATIBLE_WORK
      return codes.includes("INCOMPATIBLE_WORK");
  }
}

/** Map a backend canonical job id onto the seeded catalogue id (identity fallback). */
function resolveJobId(rawId: string): string {
  return jobById(rawId) ? rawId : seedJobOfBackendId(rawId) ?? rawId;
}

/**
 * Seed context for one live assignment — title/tier/department come from the
 * seeded catalogue when the backend id has a documented counterpart. Context
 * is display-only: times and window ids are never overridden (§46).
 */
function seedAssignmentFor(a: PlannerAssignment): PlannerAssignment {
  const seedId = resolveJobId(a.jobId);
  if (seedId === a.jobId) return a;
  const seed = jobById(seedId);
  if (!seed) return a;
  return {
    ...a,
    jobId: seedId,
    title: a.title ?? seed.title,
    department: (a.department as string) ?? seed.dept,
    tier: a.tier ?? seed.tier,
    corridorId: a.corridorId ?? seed.corridorId,
    minutes: a.minutes ?? seed.minutes,
    resources: a.resources ?? [...seed.resources],
  };
}

/** Normalize a live payload: seed ids for display, backend times untouched. */
function normalizeAssignmentsWithSeed(list: PlannerAssignment[]): PlannerAssignment[] {
  return list.map(seedAssignmentFor);
}

/* ------------------------- deferred-row assembly -------------------------- */

/** Seed fallback rows (jobId/code/reason) — the offline baseline explanations. */
const seedDeferredRows: DeferredJob[] = recommendedPlan.deferred.map((entry) => ({
  jobId: entry.jobId,
  code: entry.code,
  reason: entry.reason,
}));

/** Live backend row → display row with the seeded job id (ids only, text kept). */
function normalizeDeferredRow(row: DeferredJob): DeferredJob {
  return { ...row, jobId: resolveJobId(row.jobId) };
}

/**
 * Live deferrals merged with the seed set: a live row always wins its job;
 * seed rows are dropped when the live feed already covers (defers) that job
 * AND when the live plan actually scheduled that job — the deferred list must
 * never contradict the plan shown beside it (§46: one canonical plan).
 */
function mergeDeferredWithSeed(
  liveRows: DeferredJob[],
  scheduledSeedIds?: Iterable<string>
): DeferredJob[] {
  const live = liveRows.map(normalizeDeferredRow);
  const covered = new Set(live.map((row) => row.jobId));
  const scheduled = new Set(scheduledSeedIds ?? []);
  const extras = seedDeferredRows.filter(
    (row) => !covered.has(row.jobId) && !scheduled.has(row.jobId)
  );
  return [...live, ...extras];
}

interface CompatResolution {
  label: "Parallel" | "Sequential" | "Conditional";
  color: string;
  bg: string;
}

/** Resolve operational compatibility for an assignment within its window & corridor. */
function resolveCompatibility(
  assignment: PlannerAssignment,
  corridorId: string
): CompatResolution {
  const seedJobId = resolveJobId(assignment.jobId);
  const explicit = (assignment as any).compatibility ?? (assignment as any).compatibilityStatus;
  if (explicit === "Conditional") return { label: "Conditional", color: WARN, bg: WARN_BG };
  if (explicit === "Parallel") return { label: "Parallel", color: OK, bg: OK_BG };
  if (explicit === "Sequential") return { label: "Sequential", color: PRIMARY, bg: PRIMARY_SOFT };

  // Fallback to corridor compatibility group & parallel flag
  const group = compatGroups.find(
    (g) => g.corridorId === corridorId && g.jobIds.includes(seedJobId)
  );
  if (group?.status === "Conditional") {
    return { label: "Conditional", color: WARN, bg: WARN_BG };
  }
  if (assignment.parallel || group?.execution === "Parallel") {
    return { label: "Parallel", color: OK, bg: OK_BG };
  }
  return { label: "Sequential", color: PRIMARY, bg: PRIMARY_SOFT };
}

type Horizon = "tonight" | "week" | "month";

interface WorkspaceProps {
  onNavigate: (v: ViewId) => void;
  /** Window to preselect (e.g. after the Planning Assistant prepares a draft). */
  initialWindowId?: string;
}/**
 * Window reference for a drawer — seed ids resolve directly; backend
 * canonical block ids (`BLK-2026-…`) resolve through the documented id map;
 * otherwise a display-only reference is derived from the plan itself.
 */
export function windowRefOf(id: string, assignments: PlannerAssignment[] = recommendedPlan.assignments): WinRef {
  const w = blockWindows.find((x) => x.id === id);
  if (w)
    return { id: w.id, label: w.id, corridorId: w.corridorId, start: w.start, end: w.end, minutes: w.minutes, kind: "proposed", note: w.note };
  const b = existingBlocks.find((x) => x.id === id);
  if (b)
    return {
      id: b.id,
      label: b.blockId,
      corridorId: b.corridorId,
      start: b.start,
      end: b.end,
      minutes: spanMinutes(b.start, b.end),
      kind: "existing",
      blockId: b.blockId,
      status: b.status,
      work: b.work,
    };
  // Backend canonical window id → seeded window (W1…W3 / E1…E3), then re-resolve.
  const seedId = seedWindowOfBackendId(id);
  if (seedId && seedId !== id) return windowRefOf(seedId, assignments);
  // Live window we cannot localise — derive a reference from its assignments.
  const inWin = assignments.filter((a) => a.windowId === id);
  if (inWin.length > 0) {
    return {
      id,
      label: id,
      corridorId: corridorOfWindowId(id, inWin[0]) ?? inWin[0].corridorId ?? "C1",
      start: inWin[0].start,
      end: inWin[inWin.length - 1].end,
      minutes: occupiedUnion(inWin),
      kind: "existing",
      note: "Live planner window (canonical block id)",
    };
  }
  return { id, label: id, corridorId: "C1", start: "00:00", end: "00:00", minutes: 0, kind: "existing" };
}

/** Plan stats for ANY assignment set (seed or live), windows derived from ids. */
function planStatsFor(assignments: PlannerAssignment[]): PlanStats {
  const usedIds = [...new Set(assignments.map((a) => a.windowId))];
  const usedMinutes = usedIds.reduce((sum, id) => {
    const inWin = assignments.filter((a) => a.windowId === id);
    const proposed = blockWindows.find((w) => w.id === id);
    const seedId = proposed ? undefined : seedWindowOfBackendId(id);
    const sanctioned =
      existingBlocks.find((b) => b.id === id) ??
      existingBlocks.find((b) => b.blockId === id) ??
      existingBlocks.find((b) => b.id === seedId);
    const total = proposed
      ? proposed.minutes
      : sanctioned
        ? spanMinutes(sanctioned.start, sanctioned.end)
        : inWin[0]
          ? spanMinutes(inWin[0].start, inWin[0].end)
          : 0;
    return sum + total;
  }, 0);
  const occupied = usedIds.reduce(
    (sum, id) => sum + occupiedUnion(assignments.filter((a) => a.windowId === id)),
    0
  );
  const windowMinutes =
    usedMinutes +
    blockWindows
      .filter((w) => !usedIds.includes(w.id))
      .reduce((sum, w) => sum + w.minutes, 0);
  return {
    blocks: usedIds.length,
    jobs: assignments.length,
    windowMinutes,
    occupiedMinutes: occupied,
    unusedMinutes: Math.max(0, windowMinutes - occupied),
    utilization: windowMinutes ? Math.round((occupied / windowMinutes) * 100) : 0,
  };
}

function Workspace({ onNavigate, initialWindowId }: WorkspaceProps) {
  const [horizon, setHorizon] = useState<Horizon>("tonight");
  const [selectedId, setSelectedId] = useState<string>(initialWindowId ?? "W1");
  const [job, setJob] = useState<Job | null>(null);
  const [trainId, setTrainId] = useState<string | null>(null);
  const [winDrawerId, setWinDrawerId] = useState<string | null>(null);
  const [compatId, setCompatId] = useState<string | null>(null);
  const [conflictSubject, setConflictSubject] = useState<string | null>(null);

  /* ------------------------- Feature 23 · API state ------------------------ */
  const [deferred, setDeferred] = useState<DeferredJob[]>(seedDeferredRows);
  const [deferFilter, setDeferFilter] = useState<DeferralFilter>("all");
  const [reasonJobId, setReasonJobId] = useState<string | null>(null);
  const [reasonWindow, setReasonWindow] = useState<WindowDetails | null>(null);
  const [apiAssignments, setApiAssignments] = useState<PlannerAssignment[] | null>(null);
  const [apiSource, setApiSource] = useState<string | null>(null);
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null);
  const [planning, setPlanning] = useState<boolean>(false);
  const [planningError, setPlanningError] = useState<string | null>(null);

  /** API assignments (display-normalized) when a backend answered, else seed. */
  const effectiveAssignments: PlannerAssignment[] = useMemo(
    () => apiAssignments ?? recommendedPlan.assignments,
    [apiAssignments]
  );

  /** Seed job ids the live plan scheduled — used to drop contradicting seed deferred rows.
   * The ref mirrors the memo so async loaders always see the latest plan. */
  const liveScheduledSeedIds = useMemo(
    () => new Set((apiAssignments ?? []).map((a) => a.jobId)),
    [apiAssignments]
  );
  const liveScheduledRef = useRef<Set<string>>(liveScheduledSeedIds);
  liveScheduledRef.current = liveScheduledSeedIds;

  // Load the plan + deferred jobs from the API layer (backend first, synthetic
  // fallback inside the service). The initial render always uses the seed plan,
  // so a missing or slow backend never changes or delays the UI.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await getPlannerResult();
        if (!active) return;
        setPlannerResult(result);
        const normalized = normalizeAssignmentsWithSeed(result.assignments);
        setApiAssignments(normalized);
        setDeferred(
          mergeDeferredWithSeed(
            result.deferred,
            normalized.map((a) => a.jobId)
          )
        );
        setApiSource(result.source.status);
      } catch {
        /* the service never throws — keep the seed data on any surprise */
      }
    })();
    (async () => {
      try {
        const rows = await getDeferredJobs();
        if (!active || !Array.isArray(rows) || rows.length === 0) return;
        setDeferred(mergeDeferredWithSeed(rows, liveScheduledRef.current));
      } catch {
        /* keep the seed rows */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /** "Generate Plan" — re-run the real planner (§29, honest status banner). */
  const regenerate = async () => {
    setPlanning(true);
    setPlanningError(null);
    try {
      const result = await getPlannerResult();
      setPlannerResult(result);
      const normalized = normalizeAssignmentsWithSeed(result.assignments);
      setApiAssignments(normalized);
      setDeferred(
        mergeDeferredWithSeed(
          result.deferred,
          normalized.map((a) => a.jobId)
        )
      );
      setApiSource(result.source.status);
      if (result.source.status !== "live") {
        setPlanningError("Backend unreachable — showing the synthetic baseline plan.");
      }
    } catch (error) {
      setPlanningError(
        error instanceof Error ? `Planner request failed: ${error.message}` : "Planner request failed."
      );
    } finally {
      setPlanning(false);
    }
  };

  // Window detail for the open deferral drawer — never allowed to reject.
  useEffect(() => {
    let active = true;
    setReasonWindow(null);
    if (!reasonJobId) return;
    const row = deferred.find((entry) => entry.jobId === reasonJobId);
    const windowId = attemptedWindowOf(jobById(reasonJobId), effectiveAssignments);
    if (!row || !windowId) return;
    (async () => {
      try {
        const details = await getWindowDetails(windowId);
        if (active) setReasonWindow(details);
      } catch {
        /* missing window detail simply hides the context rows */
      }
    })();
    return () => {
      active = false;
    };
  }, [reasonJobId, deferred, effectiveAssignments]);

  const lanes = useMemo(() => buildPlanLanes(effectiveAssignments), [effectiveAssignments]);
  const stats = useMemo(() => planStatsFor(effectiveAssignments), [effectiveAssignments]);

  const selected = windowRefOf(selectedId, effectiveAssignments);
  const selectedJobs = effectiveAssignments.filter((a) => a.windowId === selectedId);
  const selectedDepts = [...new Set(selectedJobs.map((a) => a.department ?? jobById(resolveJobId(a.jobId))?.dept ?? "").filter(Boolean))];
  const selectedImpact = planAffectsWindow(selectedId, effectiveAssignments)
    ? (plannerResult?.trainImpact ?? recommendedPlan.trainImpact).filter((t) => t.includes(selectedId)).length
    : 0;
  const selectedCompat = compatGroups.find((g) => g.corridorId === selected.corridorId);
  const selectedDeferred = deferred.filter((d) => d.corridorId === selected.corridorId);

  /** Department shown for an assignment — API value first, seed lookup otherwise. */
  const deptOf = (assignment: PlannerAssignment): string | undefined => {
    const resolved = assignment.department ?? jobById(resolveJobId(assignment.jobId))?.dept;
    return resolved ? String(resolved) : undefined;
  };

  /** Deferred rows after the chip filter — filter only, never re-ordered. */
  const visibleDeferred = useMemo(
    () => deferred.filter((row) => matchesDeferralFilter(row, deferFilter)),
    [deferred, deferFilter]
  );

  /** Quality metrics derived from planner API result or synthetic baseline. */
  const qualityMetrics = useMemo<PlannerQualityMetrics>(
    () => buildQualityMetricsFromPlan(plannerResult),
    [plannerResult]
  );

  /** The deferral the Reason drawer is explaining. */
  const reasonRow = reasonJobId ? deferred.find((row) => row.jobId === reasonJobId) ?? null : null;
  const reasonWindowId = reasonRow
    ? attemptedWindowOf(jobById(reasonRow.jobId), effectiveAssignments)
    : null;
  const reasonTrains: AffectedTrain[] = reasonRow
    ? affectedTrainsOf(reasonRow.corridorId, reasonWindowId)
    : [];
  const reasonSource =
    apiSource === "live"
      ? `Planner backend · ${apiBaseUrl()}`
      : getPlannerApiStatus().message ?? "Synthetic planning dataset";

  const pick = (b: TimelineBar) => {
    if (b.trainId) {
      setTrainId(b.trainId);
      return;
    }
    if (b.winId) {
      if (b.kind === "window" || b.kind === "job") setSelectedId(b.winId);
      setWinDrawerId(b.winId);
    }
  };

  const isolationConflict = conflictEntries.find((c) => c.code === "ISOLATION_CONFLICT") ?? conflictEntries[0];
  const planVersionLabel = plannerResult?.version ? `PLAN ${plannerResult.version}` : "PLAN r3";

  if (horizon !== "tonight") {
    return (
      <div>
        <WorkspaceHeader horizon={horizon} setHorizon={setHorizon} />
        {horizon === "week" ? <WeekView /> : <MonthView />}
      </div>
    );
  }

  return (
    <div>
      <WorkspaceHeader horizon={horizon} setHorizon={setHorizon} />
      {/* Honest status banner — INFEASIBLE / backend errors are never hidden (§29, §46) */}
      {(plannerResult?.status === "INFEASIBLE" || planningError) && (
        <div
          role="status"
          className={`mb-3 rounded-lg border px-4 py-2.5 text-xs ${
            plannerResult?.status === "INFEASIBLE"
              ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
              : "border-[#fde68a] bg-[#fffbeb] text-[#92400e]"
          }`}
        >
          {plannerResult?.status === "INFEASIBLE" ? (
            <>
              <div className="text-sm font-bold">
                No feasible schedule exists for the current world — INFEASIBLE (reported honestly).
              </div>
              {(plannerResult.blockingConstraints ?? []).length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {plannerResult.blockingConstraints!.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
              <div className="mt-1 opacity-80">
                Reason codes: {(plannerResult.reasonCodes ?? []).join(", ") || "—"}
              </div>
            </>
          ) : (
            planningError
          )}
        </div>
      )}
      {/* Planning Quality Dashboard (Phase 6) */}
      <div className="mb-4">
        <PlanningQualityDashboard
          metrics={qualityMetrics}
          sourceHint={
            apiSource === "live"
              ? `CP-SAT Planner · ${apiBaseUrl()}`
              : "Synthetic Planning Baseline (backend unreachable)"
          }
        />
      </div>
      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* ------------------------------ LEFT ------------------------------ */}
        <Card className="thin-scroll max-h-[600px] overflow-y-auto p-0">
          <div className="sticky top-0 z-10 border-b border-[#eef0f6] bg-white px-4 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">Work to schedule</div>
            <div className="text-[10px] text-[#878da1]">{jobs.length} jobs · Tier 0–4 rulebook</div>
          </div>
          <div className="divide-y divide-[#eef0f6]">
            {[0, 1, 2, 3, 4].flatMap((tier) =>
              jobs
                .filter((j) => j.tier === tier)
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((j) => {
                  const sched = effectiveAssignments.find((a) => a.jobId === j.id);
                  const def = sched ? undefined : seedDeferredRows.find((d) => d.jobId === j.id) ?? deferred.find((d) => d.jobId === j.id);
                  return (
                    <button
                      key={j.id}
                      onClick={() => setJob(j)}
                      className="focus-primary block w-full px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
                    >
                      <div className="flex items-center gap-2">
                        <TierChip tier={j.tier} compact />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#171a30]">
                          <span className="font-mono text-[10px] text-[#878da1]">{j.id}</span> {j.title}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-[#878da1]">
                        <span className="font-semibold text-[#4d5468]">{j.dept}</span>
                        <span>·</span>
                        <span className="truncate">{corridorLabel(j.corridorId)}</span>
                        <span className="ml-auto shrink-0 font-mono">{j.minutes}m</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                        <span className="truncate text-[#878da1]">Due {j.deadline}</span>
                        {sched && <Chip label={`Scheduled ${sched.start}`} color={OK} bg="#f0fdf4" />}
                        {def && <ReasonChip code={def.code} />}
                      </div>
                    </button>
                  );
                })
            )}
          </div>
        </Card>
        {/* ----------------------------- CENTER ----------------------------- */}
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">Railway timeline</div>
              <div className="text-[10px] text-[#878da1]">22:00 → 08:00 · click any bar for details</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 font-mono text-[10px] text-[#878da1]">
                <span>{stats.jobs} jobs</span>
                <span>·</span>
                <span>{stats.windowMinutes} min windows</span>
                <span>·</span>
                <span>{stats.utilization}% utilized</span>
              </div>
              <Button onClick={regenerate} disabled={planning}>
                {planning ? "Planning…" : "Generate Plan"}
              </Button>
            </div>
          </div>
          <TimelineLegend />
          <Timeline lanes={lanes} onPick={pick} />
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#eef0f6] pt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Committed resources:</span>
            {(plannerResult?.resources?.length
              ? plannerResult.resources
              : ["BCM-03 (W2)", "REMM-2 (W1)", "TW-925 (E3·W3)", "Lamp party (W1)", "OHE crews A+B"]
            ).map((r) => (
              <span key={r} className="rounded-full border border-[#e3e6f0] bg-[#f5f6fc] px-2 py-0.5 font-mono text-[10px] text-[#4d5468]">
                {r}
              </span>
            ))}
          </div>
        </Card>
        {/* ------------------------------ RIGHT ----------------------------- */}
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">Recommended block plan</div>
              <span className="font-mono text-[10px] font-bold text-[#2e3092]">{planVersionLabel}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-mono text-lg font-extrabold leading-none text-[#171a30]">{stats.blocks}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">blocks</div>
              </div>
              <div>
                <div className="font-mono text-lg font-extrabold leading-none text-[#171a30]">{stats.jobs}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">jobs</div>
              </div>
              <div>
                <div className="font-mono text-lg font-extrabold leading-none text-[#171a30]">{stats.utilization}%</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">utilized</div>
              </div>
            </div>
            <div className="mt-2">
              <UtilBar pct={stats.utilization} tone={PRIMARY} />
            </div>
          </Card>

          {/* Selected block decision card */}
          <Card className="border-[#2e3092]/40 p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#878da1]">Recommended block</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <div className="truncate text-sm font-extrabold text-[#171a30]">{corridorLabel(selected.corridorId)}</div>
              <span className="shrink-0 font-mono text-[11px] font-bold text-[#2e3092]">{selected.id}</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#4d5468]">
              {selected.start}–{selected.end} · {selected.minutes} min
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-[#e3e6f0] px-1 py-1.5">
                <div className="font-mono text-sm font-extrabold text-[#171a30]">{selectedJobs.length}</div>
                <div className="text-[9px] uppercase tracking-wider text-[#878da1]">jobs</div>
              </div>
              <div className="rounded-lg border border-[#e3e6f0] px-1 py-1.5">
                <div className={`font-mono text-sm font-extrabold ${selectedImpact > 0 ? "text-[#d97706]" : "text-[#16a34a]"}`}>
                  {selectedImpact === 0 ? "Low" : selectedImpact === 1 ? "1 reg" : `${selectedImpact} regs`}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#878da1]">impact</div>
              </div>
              <div className="rounded-lg border border-[#e3e6f0] px-1 py-1.5">
                <div className={`font-mono text-sm font-extrabold ${selectedDeferred.length > 0 ? "text-[#d97706]" : "text-[#16a34a]"}`}>
                  {selectedDeferred.length === 0 ? "Met" : `${selectedDeferred.length} def`}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#878da1]">deadline</div>
              </div>
            </div>

            {selectedDepts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedDepts.map((d) => (
                  <Chip key={d} label={d} color="#4d5468" bg="#f1f3f9" />
                ))}
              </div>
            )}

            {/* Planned work in this window — enriched with operational planning intelligence */}
            {selectedJobs.length > 0 && (
              <div className="mt-2.5 rounded-lg border border-[#e3e6f0] p-0">
                <div className="border-b border-[#eef0f6] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#878da1]">
                  Planned work in this window · {selectedJobs.length}
                </div>
                <div className="divide-y divide-[#eef0f6]">
                  {selectedJobs.map((a) => {
                    const aJob = jobById(resolveJobId(a.jobId));
                    const dept = deptOf(a);
                    const resources = a.resources ?? aJob?.resources ?? [];
                    const title = a.title ?? aJob?.title;
                    const phase =
                      (a as any).phase ??
                      (a as any).operationalPhase ??
                      (a as any).executionPhase;
                    const compat = resolveCompatibility(a, selected.corridorId);
                    const placementReason =
                      (a as any).placementReason ??
                      (a as any).placement_reason ??
                      (a as any).reason ??
                      a.note;

                    return (
                      <div key={`${a.windowId}-${a.jobId}`} className="px-3 py-2.5 transition-colors duration-150 hover:bg-[#fafbfd]">
                        {/* 1. Department badge, Tier, Phase & 4. Time Window */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {dept && <DeptChip dept={dept} />}
                            {a.tier !== undefined && <TierChip tier={a.tier} compact />}
                            {phase && (
                              <span className="rounded border border-[#d9ddef] bg-[#f5f6fc] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#4d5468]">
                                {phase}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 font-mono text-[10px] font-bold text-[#171a30] bg-[#f1f3f9] px-2 py-0.5 rounded">
                            {a.start}–{a.end}
                          </span>
                        </div>

                        {/* 2. Job ID & Title */}
                        <div className="mt-1.5 flex items-baseline gap-1.5">
                          <span className="shrink-0 font-mono text-[10px] font-bold text-[#2e3092]">
                            {a.jobId}
                          </span>
                          <span className="min-w-0 truncate text-xs font-bold text-[#171a30]">
                            {title ?? "Maintenance Work"}
                          </span>
                        </div>

                        {/* 6. Compatibility Status Badge */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                            Compatibility:
                          </span>
                          <span
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                            style={{
                              color: compat.color,
                              background: compat.bg,
                              border: `1px solid ${compat.color}44`,
                            }}
                          >
                            {compat.label}
                          </span>
                        </div>

                        {/* 5. Resources */}
                        {resources.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
                              Resources:
                            </span>
                            {resources.map((resource) => (
                              <span
                                key={resource}
                                className="inline-flex items-center rounded-full border border-[#e3e6f0] bg-[#f5f6fc] px-2 py-0.5 font-mono text-[9px] font-medium text-[#4d5468]"
                              >
                                {resource}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 7. Placement Reason (Key enhancement - planner text only) */}
                        {placementReason && (
                          <div className="mt-2 rounded-md border border-[#e3e6f0] bg-[#f8f9fd] px-2.5 py-1.5 text-[11px] leading-relaxed">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#2e3092] block mb-0.5">
                              Placement Reason
                            </span>
                            <p className="text-[#171a30] text-[11px] leading-snug">
                              {placementReason}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedCompat && (
              <button
                onClick={() => setCompatId(selectedCompat.id)}
                className="focus-primary mt-2.5 flex w-full items-center justify-between rounded-lg border border-[#e3e6f0] px-3 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Compatibility</span>
                  <CompatChip status={selectedCompat.status} />
                </span>
                <span className="text-[11px] font-bold text-[#2e3092]">Why?</span>
              </button>
            )}

            <p className="mt-2.5 rounded-lg bg-[#f5f6fc] px-3 py-2 text-[11px] leading-relaxed text-[#4d5468]">
              “
              {selected.kind === "proposed"
                ? `Compatible work consolidated into one possession during a low-impact window — ${selected.note ?? "traffic gap between premier paths"}.`
                : "Already-sanctioned possession — compatible recommended work rides inside it."}
              ”
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button onClick={() => onNavigate("approval")}>Approve</Button>
              <Button variant="secondary" onClick={() => onNavigate("approval")}>
                Modify
              </Button>
              <Button variant="secondary" onClick={() => onNavigate("simulation")}>
                Simulate
              </Button>
            </div>
          </Card>
          {/* Compatibility groups — compact list */}
          <Card className="p-0">
            <div className="border-b border-[#eef0f6] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
              Compatibility groups
            </div>
            <div className="divide-y divide-[#eef0f6]">
              {compatGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setCompatId(g.id)}
                  className="focus-primary flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-[#171a30]">
                      <span className="font-mono text-[10px] text-[#878da1]">{g.id}</span> {g.title}
                    </span>
                    <span className="text-[10px] text-[#878da1]">{corridorLabel(g.corridorId)}</span>
                  </span>
                  <CompatChip status={g.status} />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {/* ------------------------- BOTTOM SUMMARY ------------------------- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="p-0">
          <div className="flex items-center justify-between gap-2 border-b border-[#eef0f6] px-4 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
              Deferred <span className="text-[#878da1]">· {deferred.length}</span>
            </div>
            {deferFilter !== "all" && (
              <span className="font-mono text-[10px] font-bold text-[#878da1]">
                {visibleDeferred.length} shown
              </span>
            )}
          </div>
          {/* Filter chips — compact horizontal filter row above the deferred jobs list */}
          <div
            role="toolbar"
            aria-label="Deferred jobs filter"
            className="flex flex-wrap items-center gap-1.5 border-b border-[#eef0f6] px-3 py-2"
          >
            {DEFER_FILTERS.map((f) => {
              const active = deferFilter === f.id;
              const count = deferred.filter((row) => matchesDeferralFilter(row, f.id)).length;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Filter: ${f.label} (${count} deferred ${count === 1 ? "job" : "jobs"})`}
                  onClick={() => setDeferFilter(active && f.id !== "all" ? "all" : f.id)}
                  className={`focus-primary inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors duration-200 ${
                    active
                      ? "border-[#2e3092] bg-[#eef0fa] text-[#2e3092]"
                      : "border-[#e3e6f0] bg-white text-[#4d5468] hover:border-[#c9cde8] hover:text-[#171a30]"
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`ml-1 font-mono text-[9px] ${
                      active ? "font-extrabold text-[#2e3092]" : "text-[#878da1]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="divide-y divide-[#eef0f6]">
            {visibleDeferred.map((d) => {
              const rowJob = jobById(d.jobId);
              return (
                <div
                  key={d.jobId}
                  className="flex items-center justify-between gap-2 px-4 py-2 transition-colors duration-200 hover:bg-[#f5f6fc]"
                >
                  <button
                    type="button"
                    onClick={() => rowJob && setJob(rowJob)}
                    className="focus-primary min-w-0 flex-1 truncate text-left text-[11px] font-semibold text-[#171a30]"
                  >
                    <span className="font-mono text-[10px] text-[#878da1]">{d.jobId}</span>{" "}
                    {d.title ?? rowJob?.title}
                  </button>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#d97706]">
                    Deferred
                  </span>
                  <button
                    type="button"
                    aria-label={`Why ${d.jobId} was not scheduled`}
                    onClick={() => setReasonJobId(d.jobId)}
                    className="focus-primary shrink-0 rounded-md border border-[#2e3092]/40 px-2 py-0.5 text-[10px] font-bold text-[#2e3092] transition-colors duration-200 hover:bg-[#eef0fa]"
                  >
                    Why?
                  </button>
                </div>
              );
            })}
            {visibleDeferred.length === 0 && (
              <div className="px-4 py-5 text-center">
                <p className="text-[11px] italic text-[#878da1]">
                  No deferred jobs match this operational filter.
                </p>
                <button
                  type="button"
                  onClick={() => setDeferFilter("all")}
                  className="focus-primary mt-1.5 inline-flex items-center text-[10px] font-bold text-[#2e3092] hover:underline"
                >
                  Clear filter (show all {deferred.length})
                </button>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-0">
          <div className="border-b border-[#eef0f6] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
            Conflict <span className="text-[#878da1]">· 1 isolation</span>
          </div>
          <button
            onClick={() => setConflictSubject(isolationConflict.subject)}
            className="focus-primary flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-bold text-[#171a30]">{isolationConflict.subject}</span>
              <span className="text-[10px] text-[#878da1]">Click for the full story — what it means</span>
            </span>
            <ReasonChip code={isolationConflict.code} />
          </button>
        </Card>

        <Card className="p-0">
          <div className="border-b border-[#eef0f6] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
            Unused window capacity <span className="text-[#878da1]">· {stats.unusedMinutes} min</span>
          </div>
          <div className="divide-y divide-[#eef0f6]">
            {blockWindows.map((w) => {
              const used = occupiedUnionOf(w.id, effectiveAssignments);
              const unused = w.minutes - used;
              return (
                <button
                  key={w.id}
                  onClick={() => setWinDrawerId(w.id)}
                  className="focus-primary flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
                >
                  <span className="text-[11px] font-semibold text-[#171a30]">
                    {w.id} · {corridorLabel(w.corridorId)}
                  </span>
                  <span className={`font-mono text-[11px] font-bold ${unused > 0 ? "text-[#d97706]" : "text-[#16a34a]"}`}>
                    {unused > 0 ? `${unused} min free` : "full"}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ----------------------------- DRAWERS ----------------------------- */}
      {job && <JobDrawer job={job} onClose={() => setJob(null)} />}
      {trainId && <TrainDrawer trainId={trainId} onClose={() => setTrainId(null)} />}
      {winDrawerId && <WindowDrawer win={windowRefOf(winDrawerId, effectiveAssignments)} onClose={() => setWinDrawerId(null)} />}
      {compatId && <CompatDrawer group={compatGroups.find((g) => g.id === compatId)!} onClose={() => setCompatId(null)} />}
      {conflictSubject && (
        <ConflictDrawer entry={conflictEntries.find((c) => c.subject === conflictSubject)!} onClose={() => setConflictSubject(null)} />
      )}
      {/* Feature 23 — deferral explanation ("Why wasn't this scheduled?") */}
      {reasonRow && (
        <ReasonDrawer
          deferral={reasonRow}
          jobTitle={reasonRow.title ?? jobById(reasonRow.jobId)?.title}
          attemptedWindow={reasonWindowId}
          affectedTrains={reasonTrains}
          windowNote={reasonWindow?.note}
          source={reasonSource}
          onClose={() => setReasonJobId(null)}
        />
      )}
    </div>
  );
}

/** Occupied union minutes for one window (seed id or backend block id). */
function occupiedUnionOf(windowId: string, assignments: PlannerAssignment[]): number {
  const direct = assignments.filter((a) => a.windowId === windowId);
  if (direct.length) return occupiedUnion(direct);
  const seedId = seedWindowOfBackendId(windowId);
  return seedId ? occupiedUnion(assignments.filter((a) => a.windowId === seedId)) : 0;
}

/** True when the plan schedules at least one job inside this window. */
function planAffectsWindow(windowId: string, assignments: PlannerAssignment[]): boolean {
  if (assignments.some((a) => a.windowId === windowId)) return true;
  const seedId = seedWindowOfBackendId(windowId);
  return seedId ? assignments.some((a) => a.windowId === seedId) : false;
}

/** Workspace header — title, planning date, Tonight / Week / Month switch. */
function WorkspaceHeader({ horizon, setHorizon }: { horizon: Horizon; setHorizon: (h: Horizon) => void }) {
  const items: { id: Horizon; label: string }[] = [
    { id: "tonight", label: "Tonight" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold tracking-wide text-[#171a30]">Planning Workspace</h2>
        <p className="mt-0.5 text-xs text-[#878da1]">{PLAN_DATE} · NDLS–BSB trunk · authorize only via Human Approval</p>
      </div>
      <div className="flex rounded-lg border border-[#e3e6f0] bg-white p-0.5">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => setHorizon(it.id)}
            className={`focus-primary rounded-md px-3 py-1 text-[11px] font-bold transition-colors duration-200 ${
              horizon === it.id ? "bg-[#2e3092] text-white" : "text-[#4d5468] hover:bg-[#f5f6fc]"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Workspace;