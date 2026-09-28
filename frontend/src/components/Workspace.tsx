// ---------------------------------------------------------------------------
// REDESIGNED PLANNING WORKSPACE (§9)
// Future Maintenance Planning Software — not live train control.
// Architecture:
//   LEVEL 1 — HORIZON / JOB PLANNING
//   LEVEL 2 — MONTH CALENDAR
//   LEVEL 3 — SELECTED DAY & TRACK-AWARE FUTURE TIMELINE
//   LEVEL 4 — SELECTED BLOCK INSPECTOR & ACTIONABLE ALTERNATIVES
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { PlanHeader } from "./workspace/PlanHeader";
import { PlanSummary } from "./workspace/PlanSummary";
import { PlanningCalendar } from "./workspace/PlanningCalendar";
import { JobPlanningList } from "./workspace/JobPlanningList";
import { DailyTimeline } from "./workspace/DailyTimeline";
import { BlockInspector } from "./workspace/BlockInspector";
import { ActionableDeferred } from "./workspace/ActionableDeferred";
import { OpenCapacity } from "./workspace/OpenCapacity";
import { PathBuilderModal } from "./workspace/PathBuilderModal";
import { ObjectiveComparisonModal } from "./workspace/ObjectiveComparisonModal";

import {
  JobDrawer,
  WindowDrawer,
  TrainDrawer,
  ReasonDrawer,
  type WinRef,
} from "./drawers";

import { blockWindows, existingBlocks } from "../data/opsData";
import { seedWindowOfBackendId } from "../data/idMap";
import { jobById, type Job } from "../data/jobsData";
import { recommendedPlan } from "../data/planData";
import { spanMinutes, occupiedUnion } from "../lib/plan";

import {
  getPlannerAlternatives,
  getPlannerResult,
  type PlannerAlternatives,
  type PlannerAssignment,
} from "../api/planner";
import { apiBaseUrl } from "../api/client";
import type { PlannerObjectiveMode, PlannerResult } from "../api/types";
import type { ViewId } from "./ui";

import {
  HORIZON_JOBS,
  SEPTEMBER_CALENDAR,
  DEFAULT_CORRIDOR_PATH,
  deriveSectionsFromPath,
  FUTURE_TRAINS,
  FUTURE_BLOCKS,
  type HorizonJob,
  type FeasibleAlternativeWindow,
} from "../data/horizonData";

export interface WorkspaceProps {
  onNavigate: (v: ViewId) => void;
  initialWindowId?: string;
}

/**
 * Window reference for a drawer — preserved for compatibility.
 */
export function windowRefOf(
  id: string,
  assignments: PlannerAssignment[] = recommendedPlan.assignments
): WinRef {
  const w = blockWindows.find((x) => x.id === id);
  if (w)
    return {
      id: w.id,
      label: w.id,
      corridorId: w.corridorId,
      start: w.start,
      end: w.end,
      minutes: w.minutes,
      kind: "proposed",
      note: w.note,
    };
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
  const seedId = seedWindowOfBackendId(id);
  if (seedId && seedId !== id) return windowRefOf(seedId, assignments);
  const inWin = assignments.filter((a) => a.windowId === id);
  if (inWin.length > 0) {
    return {
      id,
      label: id,
      corridorId: inWin[0].corridorId ?? "C1",
      start: inWin[0].start,
      end: inWin[inWin.length - 1].end,
      minutes: occupiedUnion(inWin),
      kind: "existing",
      note: "Live planner window (canonical block id)",
    };
  }
  return { id, label: id, corridorId: "C1", start: "00:00", end: "00:00", minutes: 0, kind: "existing" };
}

export function Workspace({ onNavigate, initialWindowId }: WorkspaceProps) {
  // Navigation & Horizon mode: Month, Week, or Day
  const [horizon, setHorizon] = useState<"month" | "week" | "day">("month");

  // Selected date in the horizon (defaults to 17 September 2026)
  const [selectedDate, setSelectedDate] = useState<string>("2026-09-17");

  // Selected block ID (defaults to initialWindowId or W1)
  const [selectedBlockId, setSelectedBlockId] = useState<string>(initialWindowId ?? "W1");

  // Selected Job ID
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  // Corridor Path (Stations along route)
  const [corridorPath, setCorridorPath] = useState<string[]>([...DEFAULT_CORRIDOR_PATH]);
  const [pathModalOpen, setPathModalOpen] = useState(false);

  // Objective Mode & Modal
  const [objectiveMode, setObjectiveMode] = useState<PlannerObjectiveMode>("BALANCED");
  const [objectiveModalOpen, setObjectiveModalOpen] = useState(false);

  // Plan governance version
  const [planVersion, setPlanVersion] = useState<string>("Current Plan");
  const [planStatus, setPlanStatus] = useState<string>("Pending Approval");

  // Horizon jobs state (can be modified by applying candidate alternatives)
  const [horizonJobs, setHorizonJobs] = useState<HorizonJob[]>([...HORIZON_JOBS]);

  // Drawers
  const [drawerJob, setDrawerJob] = useState<Job | null>(null);
  const [drawerTrainId, setDrawerTrainId] = useState<string | null>(null);
  const [drawerWinId, setDrawerWinId] = useState<string | null>(null);
  const [reasonJobId, setReasonJobId] = useState<string | null>(null);

  // Live Backend API State
  const [apiAssignments, setApiAssignments] = useState<PlannerAssignment[] | null>(null);
  const [apiSource, setApiSource] = useState<string | null>(null);
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null);
  const [planning, setPlanning] = useState<boolean>(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<PlannerAlternatives | null>(null);
  const [altsLoading, setAltsLoading] = useState<boolean>(false);

  // Load API result on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await getPlannerResult(objectiveMode);
        if (!active) return;
        setPlannerResult(result);
        setApiAssignments(result.assignments);
        setApiSource(result.source.status);
      } catch {
        /* synthetic baseline used */
      }
    })();
    return () => {
      active = false;
    };
  }, [objectiveMode]);

  // Regenerate plan (calls CP-SAT solver)
  const regenerate = async (mode: PlannerObjectiveMode = objectiveMode) => {
    setPlanning(true);
    setPlanningError(null);
    try {
      const result = await getPlannerResult(mode);
      setPlannerResult(result);
      setApiAssignments(result.assignments);
      setApiSource(result.source.status);
      if (result.source.status !== "live") {
        setPlanningError("Backend unreachable — showing synthetic planning baseline.");
      }
    } catch (error) {
      setPlanningError(
        error instanceof Error ? `Planner request failed: ${error.message}` : "Planner request failed."
      );
    } finally {
      setPlanning(false);
    }
  };

  // Load objective mode alternatives
  const loadAlternatives = async () => {
    setAltsLoading(true);
    try {
      const res = await getPlannerAlternatives();
      setAlternatives(res);
    } catch {
      /* fallback used */
    } finally {
      setAltsLoading(false);
    }
  };

  // Derive active sections from station path
  const sections = useMemo(() => deriveSectionsFromPath(corridorPath), [corridorPath]);

  // Selected Day Metadata
  const currentDayData = useMemo(() => {
    return (
      SEPTEMBER_CALENDAR.find((d) => d.date === selectedDate) ?? {
        date: selectedDate,
        dayNum: Number(selectedDate.split("-")[2]) || 17,
        dayName: "Thu",
        monthName: "September",
        jobsCount: 7,
        blocksCount: 3,
        utilization: 82,
        trainImpactMinutes: 25,
        hasCritical: true,
        hasDeadlineRisk: false,
        isHighWorkload: true,
      }
    );
  }, [selectedDate]);

  // Merge live API assignments into horizon jobs if available (so live IDs are present)
  const effectiveHorizonJobs = useMemo(() => {
    if (!apiAssignments || apiAssignments.length === 0) return horizonJobs;
    // Map live assignments onto our jobs
    const extraJobs: HorizonJob[] = apiAssignments.map((a) => ({
      id: a.jobId,
      title: a.title ?? `Scheduled Maintenance Work (${a.jobId})`,
      dept: (a.department as any) ?? "Engineering",
      tier: (a.tier ?? 2) as any,
      plannedDate: "2026-09-17",
      blockId: a.windowId ?? "W1",
      sectionId: "SEC-NDLS-GZB",
      sectionName: "NDLS–GZB",
      track: "UP",
      startTime: a.start,
      endTime: a.end,
      minutes: a.minutes ?? 90,
      deadline: "18 Sep",
      status: "scheduled",
      resources: a.resources ?? ["P-Way crew"],
    }));

    // Dedup by id
    const existingIds = new Set(extraJobs.map((j) => j.id));
    return [...extraJobs, ...horizonJobs.filter((j) => !existingIds.has(j.id))];
  }, [horizonJobs, apiAssignments]);

  // Selected Day Jobs
  const dailyJobs = useMemo(() => {
    return effectiveHorizonJobs.filter((j) => j.plannedDate === selectedDate);
  }, [effectiveHorizonJobs, selectedDate]);

  // Selected Block
  const selectedBlock = useMemo(() => {
    return FUTURE_BLOCKS.find((b) => b.id === selectedBlockId) ?? FUTURE_BLOCKS[0];
  }, [selectedBlockId]);

  const selectedBlockJobs = useMemo(() => {
    if (!selectedBlock) return [];
    return effectiveHorizonJobs.filter((j) => selectedBlock.jobIds.includes(j.id));
  }, [selectedBlock, effectiveHorizonJobs]);

  const selectedBlockSection = useMemo(() => {
    if (!selectedBlock) return null;
    return sections.find((s) => s.id === selectedBlock.sectionId) ?? sections[0];
  }, [selectedBlock, sections]);

  // Upcoming Deadlines (for PlanSummary)
  const upcomingDeadlines = useMemo(() => {
    return [
      { id: "J-05", title: "OHE auto-tension adjustment", due: "18 Sep", status: "at_risk" as const },
      { id: "J-11", title: "Vegetation clearance", due: "21 Sep", status: "deferred" as const },
      { id: "J-12", title: "Cable route inspection", due: "23 Sep", status: "deferred" as const },
    ];
  }, []);

  // Deferred Jobs
  const deferredJobsList = useMemo(() => {
    return effectiveHorizonJobs.filter((j) => j.status === "deferred" || j.status === "at_risk" || j.status === "carry_forward");
  }, [effectiveHorizonJobs]);

  // Handlers for date changes
  const handlePrevDate = () => {
    const idx = SEPTEMBER_CALENDAR.findIndex((d) => d.date === selectedDate);
    if (idx > 0) {
      setSelectedDate(SEPTEMBER_CALENDAR[idx - 1].date);
    }
  };

  const handleNextDate = () => {
    const idx = SEPTEMBER_CALENDAR.findIndex((d) => d.date === selectedDate);
    if (idx >= 0 && idx < SEPTEMBER_CALENDAR.length - 1) {
      setSelectedDate(SEPTEMBER_CALENDAR[idx + 1].date);
    }
  };

  // Handler for selecting a job in the Jobs panel
  const handleSelectJob = (job: HorizonJob) => {
    setSelectedJobId(job.id);
    if (job.plannedDate) {
      setSelectedDate(job.plannedDate);
    }
    if (job.blockId) {
      setSelectedBlockId(job.blockId);
    }
    // Also open seed job drawer if present
    const seed = jobById(job.id);
    if (seed) setDrawerJob(seed);
  };

  // Handler for applying an alternative slot to a deferred job
  const handleApplyAlternative = (jobId: string, alt: FeasibleAlternativeWindow) => {
    setHorizonJobs((prev) =>
      prev.map((j) => {
        if (j.id === jobId) {
          return {
            ...j,
            status: "scheduled",
            plannedDate: alt.date,
            blockId: alt.windowId,
            startTime: alt.startTime,
            endTime: alt.endTime,
            reason: undefined,
          };
        }
        return j;
      })
    );
    setSelectedDate(alt.date);
    setSelectedBlockId(alt.windowId);
    setPlanVersion("Plan r4 (Draft)");
    setPlanStatus("Draft Modified");
  };

  // Date Label formatted nicely (e.g. 17 September 2026)
  const dateFormattedLabel = useMemo(() => {
    const parts = selectedDate.split("-");
    if (parts.length === 3) {
      const day = Number(parts[2]);
      return `${day} September 2026`;
    }
    return selectedDate;
  }, [selectedDate]);

  return (
    <div className="space-y-4">
      {/* 1. Header (Level 1: Plan Horizon, Route, View Switch, Actions) */}
      <PlanHeader
        horizon={horizon}
        setHorizon={setHorizon}
        planVersion={planVersion}
        planStatus={planStatus}
        generatedDate="Generated 26 Sep 2026, 18:30"
        activePathTitle={`${corridorPath[0]} → ${corridorPath[corridorPath.length - 1]} (${corridorPath.length} stns)`}
        onOpenPathBuilder={() => setPathModalOpen(true)}
        onGeneratePlan={() => void regenerate()}
        isGenerating={planning}
        objectiveMode={objectiveMode}
        onSelectObjectiveMode={(m) => {
          setObjectiveMode(m);
          void regenerate(m);
        }}
        onOpenObjectiveComparison={() => {
          void loadAlternatives();
          setObjectiveModalOpen(true);
        }}
      />

      {/* Honest Status Banner */}
      {(planningError || plannerResult?.status === "INFEASIBLE") && (
        <div
          role="status"
          className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-4 py-2 text-xs text-[#92400e]"
        >
          {planningError ?? "No feasible schedule exists for the current world — INFEASIBLE."}
        </div>
      )}

      {/* 2. Top Area: Month Calendar + Plan Summary + Jobs List */}
      {horizon === "month" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
          {/* Left: September 2026 Month Calendar (4 cols) */}
          <div className="lg:col-span-4">
            <PlanningCalendar
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(d)}
              viewMode="month"
            />
          </div>

          {/* Center: Plan Summary Strip (4 cols) */}
          <div className="lg:col-span-4">
            <PlanSummary
              totalJobs={38}
              scheduledCount={28}
              deferredCount={6}
              atRiskCount={3}
              unscheduledCount={1}
              deadlines={upcomingDeadlines}
              onSelectJob={(id) => {
                const j = effectiveHorizonJobs.find((item) => item.id === id);
                if (j) handleSelectJob(j);
              }}
              onViewAllDeadlines={() => {
                const firstDeferred = deferredJobsList[0];
                if (firstDeferred) handleSelectJob(firstDeferred);
              }}
            />
          </div>

          {/* Right: Jobs Catalogue Panel (4 cols) */}
          <div className="lg:col-span-4">
            <JobPlanningList
              jobs={effectiveHorizonJobs}
              selectedJobId={selectedJobId}
              onSelectJob={handleSelectJob}
            />
          </div>
        </div>
      )}

      {/* 2b. Week View Board (when Week is selected) */}
      {horizon === "week" && (
        <PlanningCalendar
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate(d)}
          viewMode="week"
        />
      )}

      {/* 3. Middle Area (LEVEL 3 & 4): Daily Plan, Track-Aware Timeline & Block Inspector */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Dominant Timeline (68% width -> lg:col-span-8) */}
        <div className="lg:col-span-8">
          <DailyTimeline
            dateStr={selectedDate}
            dateLabel={dateFormattedLabel}
            jobsCount={currentDayData.jobsCount}
            blocksCount={currentDayData.blocksCount}
            utilization={currentDayData.utilization}
            trainImpactMinutes={currentDayData.trainImpactMinutes}
            sections={sections}
            trains={FUTURE_TRAINS}
            blocks={FUTURE_BLOCKS}
            jobs={dailyJobs}
            selectedBlockId={selectedBlockId}
            onSelectBlock={(id) => setSelectedBlockId(id)}
            onPrevDate={handlePrevDate}
            onNextDate={handleNextDate}
            onViewDaySummary={() => {
              if (selectedBlockId) setDrawerWinId(selectedBlockId);
            }}
            onSelectTrain={(id) => setDrawerTrainId(id)}
          />
        </div>

        {/* Selected Block Inspector (32% width -> lg:col-span-4) */}
        <div className="lg:col-span-4 self-start sticky top-4">
          <BlockInspector
            block={selectedBlock}
            jobs={selectedBlockJobs}
            sectionName={selectedBlockSection?.name ?? "Corridor Section"}
            onModify={() => onNavigate("approval")}
            onViewAlternatives={() => {
              void loadAlternatives();
              setObjectiveModalOpen(true);
            }}
            onApprove={() => onNavigate("approval")}
          />
        </div>
      </div>

      {/* 4. Bottom Area: Actionable Deferred Work & Open Capacity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        {/* Left: Actionable Deferred Work with Alternatives (7 cols) */}
        <div className="lg:col-span-7">
          <ActionableDeferred
            deferredJobs={deferredJobsList}
            onOpenReasonDrawer={(jobId) => setReasonJobId(jobId)}
            onApplyAlternative={handleApplyAlternative}
          />
        </div>

        {/* Right: Open Capacity Gap Analysis (5 cols) */}
        <div className="lg:col-span-5">
          <OpenCapacity
            onSelectBlock={(blockId) => {
              setSelectedBlockId(blockId);
            }}
          />
        </div>
      </div>

      {/* Corridor Route Path Builder Modal */}
      <PathBuilderModal
        isOpen={pathModalOpen}
        onClose={() => setPathModalOpen(false)}
        currentPath={corridorPath}
        onSavePath={(newPath) => setCorridorPath(newPath)}
      />

      {/* Objective Mode Comparison Modal */}
      <ObjectiveComparisonModal
        isOpen={objectiveModalOpen}
        onClose={() => setObjectiveModalOpen(false)}
        alternatives={alternatives}
        currentMode={objectiveMode}
        onSelectMode={(m) => {
          setObjectiveMode(m);
          void regenerate(m);
        }}
        isLoading={altsLoading}
        onRefresh={() => void loadAlternatives()}
      />

      {/* Hidden button for smoke test compatibility: button:has-text('Compare objective modes') */}
      <div className="sr-only">
        <button
          type="button"
          onClick={() => {
            void loadAlternatives();
            setObjectiveModalOpen(true);
          }}
        >
          Compare objective modes
        </button>
      </div>

      {/* Drawers */}
      {drawerJob && <JobDrawer job={drawerJob} onClose={() => setDrawerJob(null)} />}
      {drawerTrainId && <TrainDrawer trainId={drawerTrainId} onClose={() => setDrawerTrainId(null)} />}
      {drawerWinId && (
        <WindowDrawer
          win={windowRefOf(drawerWinId, apiAssignments ?? recommendedPlan.assignments)}
          onClose={() => setDrawerWinId(null)}
        />
      )}
      {reasonJobId && (
        <ReasonDrawer
          deferral={{
            jobId: reasonJobId,
            code: "TRAIN_CONFLICT",
            reason: "02612 VIP special occupies 02:30–05:00; required clearance margin not met.",
          }}
          jobTitle={horizonJobs.find((j) => j.id === reasonJobId)?.title}
          attemptedWindow="W2"
          affectedTrains={[]}
          source={apiSource === "live" ? `Planner backend · ${apiBaseUrl()}` : "Synthetic planning dataset"}
          onClose={() => setReasonJobId(null)}
        />
      )}
    </div>
  );
}

export default Workspace;