// ---------------------------------------------------------------------------
// SIMULATION (§14) — Operational Replay & What-If Studio
// Replay experience: BEFORE → EVENT → AFTER.
// Includes staged Event Playback, interactive timeline playback with moving
// time indicator, targeted corridor highlighting, animated resource
// reassignments, progressive conflict reveals, and Before vs After comparison.
// Nothing is saved until the officer sends the revised plan to Approval.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Button,
  Card,
  Collapse,
  TierChip,
  SectionHeader,
  CRIT,
  NEUTRAL,
  OK,
  PRIMARY,
  WARN,
} from "./ui";
import { toast, ToastContainer } from "./Toast";
import { jobById, jobs } from "../data/jobsData";
import { recommendedPlan, type DeferredJob } from "../data/planData";
import { occupiedUnion } from "../lib/plan";
import { UtilBar } from "./TimelineUtil";
import {
  PlanningQualityDashboard,
  type PlannerQualityMetrics,
} from "./PlannerKpiCard";
import {
  Play,
  Pause,
  RotateCcw,
  StepForward,
  AlertTriangle,
  Clock,
  ArrowRight,
  Wrench,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";

/* --------------------------------- model ---------------------------------- */

interface SimWindow {
  id: string;
  label: string;
  minutes: number;
  reserved?: string;
}

interface SimJob {
  jobId: string;
  windowId: string;
  minutes: number;
  start?: string;
  end?: string;
  note?: string;
}

interface SimState {
  windows: SimWindow[];
  scheduled: SimJob[];
  deferred: (DeferredJob & { note?: string })[];
  impact: string[];
}

export interface SimConflict {
  id: string;
  code: "TRAIN_CONFLICT" | "RESOURCE_CONFLICT" | "ISOLATION_CONFLICT";
  title: string;
  detail: string;
  resolution: string;
  corridor: string;
}

export interface SimResourceTransition {
  id: string;
  name: string;
  role: string;
  corridor: string;
  initialState: string;
  transitionalState: string;
  finalState: string;
  tone: "ok" | "warn" | "primary" | "crit";
  iconType: "wagon" | "crew" | "power" | "machine";
}

const mins = (a: string, b: string): number =>
  Math.round(
    (new Date(`2000-01-01T${b}`).getTime() - new Date(`2000-01-01T${a}`).getTime()) /
      60000
  );

const baseState = (): SimState => ({
  windows: [
    { id: "W1", label: "NDLS–GZB (UP)", minutes: 180 },
    { id: "W2", label: "TDL–CNB (DOWN)", minutes: 240 },
    { id: "W3", label: "PRYJ–DDU (UP)", minutes: 285 },
  ],
  scheduled: recommendedPlan.assignments
    .filter((a) => a.windowId !== "E3") // sanctioned block — not re-planned here
    .map((a) => ({
      jobId: a.jobId,
      windowId: a.windowId,
      minutes: mins(a.start, a.end),
      start: a.start,
      end: a.end,
      note: a.note,
    })),
  deferred: recommendedPlan.deferred.map((d) => ({ ...d })),
  impact: [...recommendedPlan.trainImpact],
});

const defer = (
  s: SimState,
  jobId: string,
  code: DeferredJob["code"],
  reason: string
) => {
  s.scheduled = s.scheduled.filter((j) => j.jobId !== jobId);
  s.deferred = [
    ...s.deferred.filter((d) => d.jobId !== jobId),
    { jobId, code, reason },
  ];
};

export type CorridorKey = "NDLS–GZB" | "TDL–CNB" | "PRYJ–DDU";

export interface Scenario {
  id: string;
  label: string;
  detail: string;
  affectedCorridor: CorridorKey;
  event: [string, string][];
  changes: string[];
  conflicts: SimConflict[];
  resources: SimResourceTransition[];
  eventTimeStart?: string;
  eventTimeEnd?: string;
  eventLabel?: string;
  apply: (s: SimState) => void;
}

/* ------------------------------- scenarios -------------------------------- */

const SCENARIOS: Scenario[] = [
  {
    id: "relief",
    label: "Relief / special train",
    detail: "Protected movement consumes part of a corridor window — the plan re-organizes around it.",
    affectedCorridor: "NDLS–GZB",
    eventTimeStart: "02:30",
    eventTimeEnd: "03:30",
    eventLabel: "Relief Train 00214 Down (Protected Path)",
    event: [
      ["Event", "Relief train (protected path)"],
      ["Corridor", "NDLS–GZB (W1)"],
      ["Reserved", "02:30–03:30 · 60 min"],
      ["Rule", "Maintenance clears the protected path — no overlap permitted"],
    ],
    changes: [
      "W1 loses 60 minutes of usable capacity to the protected movement",
      "J-02 rail weld (T1) pulled ahead to 01:00–02:30 — still completes before the movement",
      "J-09 lamp batch rides the same protection, now 01:00–02:00",
      "J-13 trolley patrol (T4) no longer fits — deferred, next opportunity 16 Sep",
    ],
    conflicts: [
      {
        id: "c1",
        code: "TRAIN_CONFLICT",
        title: "Path Contention with Special 00214 Down",
        detail: "Protected movement occupies 02:30–03:30 on NDLS–GZB track 1. Mandatory clear-track rule triggers.",
        resolution: "Autonomous adjustment: Scheduled maintenance work orders shifted 60 min ahead to 01:00.",
        corridor: "NDLS–GZB",
      },
      {
        id: "c2",
        code: "RESOURCE_CONFLICT",
        title: "Tower Wagon RU-04 Standby Assignment",
        detail: "Tower Wagon RU-04 required for emergency transit escort, creating overlap with scheduled works.",
        resolution: "Consolidated J-09 lamp batch into early weld slot; freed Tower Wagon for standby.",
        corridor: "NDLS–GZB",
      },
      {
        id: "c3",
        code: "ISOLATION_CONFLICT",
        title: "25kV Traction Power Shutoff Span Clamping",
        detail: "Overhead power shutdown must terminate precisely before diesel relief transit clears section.",
        resolution: "De-energization window clamped to 01:00–02:30 sharp; grounding verified.",
        corridor: "NDLS–GZB",
      },
    ],
    resources: [
      {
        id: "r1",
        name: "Tower Wagon RU-04",
        role: "TRD Northern Unit",
        corridor: "NDLS–GZB",
        initialState: "Assigned (02:00–03:30)",
        transitionalState: "Re-routing to 01:00 advance",
        finalState: "Escorting Relief Movement (02:30)",
        tone: "warn",
        iconType: "wagon",
      },
      {
        id: "r2",
        name: "Rail Weld Gang NCR-2",
        role: "Permanent Way",
        corridor: "NDLS–GZB",
        initialState: "Slot: 02:00–03:30",
        transitionalState: "Advancing to 01:00 slot",
        finalState: "Completed ahead of convoy",
        tone: "ok",
        iconType: "crew",
      },
      {
        id: "r3",
        name: "Feeder Section 4B Isolation",
        role: "Traction Power",
        corridor: "NDLS–GZB",
        initialState: "Full 180m isolation",
        transitionalState: "Recalibrating shutoff span",
        finalState: "Re-energized at 02:30 IST",
        tone: "primary",
        iconType: "power",
      },
    ],
    apply: (s) => {
      const w1 = s.windows.find((w) => w.id === "W1");
      if (!w1) return;
      w1.reserved = "02:30–03:30 — relief train path";
      const j2 = s.scheduled.find((j) => j.jobId === "J-02");
      if (j2) {
        j2.start = "01:00";
        j2.end = "02:30";
        j2.note = "moved ahead of the protected path";
      }
      const j9 = s.scheduled.find((j) => j.jobId === "J-09");
      if (j9) {
        j9.start = "01:00";
        j9.end = "02:00";
        j9.note = "rides the weld protection, moved ahead";
      }
      defer(
        s,
        "J-07",
        "INSUFFICIENT_WINDOW",
        "W3 consumed by the Tier 0 emergency; balance axle-counter work moves to 16 Sep."
      );
      s.impact.push("Tier 0 emergency path cleared before CONCOR-2210.");
    },
  },
  {
    id: "reduce",
    label: "Reduce block window",
    detail: "Traffic pressure forces W2 (TDL–CNB DOWN) down to 180 min.",
    affectedCorridor: "TDL–CNB",
    eventTimeStart: "04:30",
    eventTimeEnd: "05:30",
    eventLabel: "Window Curtailment (-60 min for Freight Surge)",
    event: [
      ["Event", "Window reduction"],
      ["Corridor", "TDL–CNB (W2)"],
      ["Change", "240 → 180 min"],
      ["Rule", "Scheduled work must fit or defer"],
    ],
    changes: [
      "W2 shrinks 240 → 180 min under freight pressure",
      "J-04 ballast cleaning completes only 2 of 3 passes",
      "Balance pass (60 min) moves to 16 Sep — geometry TSR stays one more night",
    ],
    conflicts: [
      {
        id: "c1",
        code: "TRAIN_CONFLICT",
        title: "Freight Trailing Path Reclaimed",
        detail: "Container rake BCNA-47012 cannot hold at Tundla outer without severe yard congestion.",
        resolution: "Reclaimed 60 min possession; window shortened to restore freight velocity.",
        corridor: "TDL–CNB",
      },
      {
        id: "c2",
        code: "RESOURCE_CONFLICT",
        title: "Ballast Machine BCM-0932 Pass Curtailment",
        detail: "3 passes planned (240 min). Compressed window allows 2 passes only.",
        resolution: "Pass 3 split and deferred to 16 Sep roster. Temporary speed restriction (TSR 40) retained.",
        corridor: "TDL–CNB",
      },
    ],
    resources: [
      {
        id: "r1",
        name: "BCM-0932 Ballast Cleaner",
        role: "Track Machinery NCR",
        corridor: "TDL–CNB",
        initialState: "3 Passes (240 min)",
        transitionalState: "Shortening run to 180 min",
        finalState: "2 Passes Executed (Pass 3 deferred)",
        tone: "warn",
        iconType: "machine",
      },
      {
        id: "r2",
        name: "Operator Crew TDL-4",
        role: "Track Machine Gang",
        corridor: "TDL–CNB",
        initialState: "Assigned 01:30–05:30",
        transitionalState: "Shift duration truncated",
        finalState: "Cleared at 04:30 IST",
        tone: "ok",
        iconType: "crew",
      },
    ],
    apply: (s) => {
      const w2 = s.windows.find((w) => w.id === "W2");
      if (!w2 || w2.minutes <= 180) return;
      w2.minutes = 180;
      w2.label = "TDL–CNB (DOWN) — reduced window";
      const j4 = s.scheduled.find((j) => j.jobId === "J-04");
      if (j4) {
        j4.end = "04:30";
        j4.minutes = 180;
        j4.note = "partial — 2 of 3 passes";
      }
      defer(
        s,
        "J-04",
        "INSUFFICIENT_WINDOW",
        "Balance pass-3 (60 min) does not fit the reduced window."
      );
      s.impact.push("BCNA-47012 freight released without hold (shorter W2).");
    },
  },
  {
    id: "remove",
    label: "Remove block window",
    detail: "MGS junction track-circuit failure withdraws W3 (PRYJ–DDU UP).",
    affectedCorridor: "PRYJ–DDU",
    eventTimeStart: "01:30",
    eventTimeEnd: "06:15",
    eventLabel: "MGS Relay Circuit Failure (Possession Withdrawn)",
    event: [
      ["Event", "Window withdrawal"],
      ["Corridor", "PRYJ–DDU (W3)"],
      ["Cause", "MGS junction track-circuit failure"],
      ["Rule", "No safe possession without interlocking"],
    ],
    changes: [
      "W3 withdrawn — junction interlocking unavailable",
      "J-05 (Tier 2) and J-07 (Tier 3) both defer",
      "Utilization drops on remaining windows — deferred volume rises",
    ],
    conflicts: [
      {
        id: "c1",
        code: "ISOLATION_CONFLICT",
        title: "Interlocking Route Locking Failure",
        detail: "Track circuit 14BT dropped; route holding cannot guarantee isolated block perimeter.",
        resolution: "Operating department revokes W3 possession permit per safety regulation 4.19.",
        corridor: "PRYJ–DDU",
      },
      {
        id: "c2",
        code: "RESOURCE_CONFLICT",
        title: "Displaced Axle Counter & Track Gangs",
        detail: "Crews mobilized for J-05 and J-07 left without authorized possession window.",
        resolution: "Stood down to base depot; scheduled for priority insertion into 16 Sep cycle.",
        corridor: "PRYJ–DDU",
      },
    ],
    resources: [
      {
        id: "r1",
        name: "Axle Counter Crew AC-01",
        role: "S&T Inspection",
        corridor: "PRYJ–DDU",
        initialState: "Mobilized for J-07",
        transitionalState: "Possession cancelled",
        finalState: "Stood down (Re-rostered 16 Sep)",
        tone: "crit",
        iconType: "crew",
      },
      {
        id: "r2",
        name: "Track Gang PRYJ-4",
        role: "Civil Engineering",
        corridor: "PRYJ–DDU",
        initialState: "Assigned J-05",
        transitionalState: "Withdrawal acknowledged",
        finalState: "Stood down (Re-rostered 16 Sep)",
        tone: "crit",
        iconType: "crew",
      },
    ],
    apply: (s) => {
      s.windows = s.windows.filter((w) => w.id !== "W3");
      s.scheduled = s.scheduled.filter((j) => {
        if (j.windowId !== "W3") return true;
        defer(
          s,
          j.jobId,
          "INSUFFICIENT_WINDOW",
          "W3 withdrawn after MGS junction track-circuit failure; re-planned 16 Sep."
        );
        return false;
      });
      s.impact.push("CONCOR-2210 path protected without regulation.");
    },
  },
  {
    id: "priority",
    label: "Change priority",
    detail: "Pivot overheating reports raise J-10 lubrication Tier 4 → Tier 2.",
    affectedCorridor: "NDLS–GZB",
    eventTimeStart: "02:00",
    eventTimeEnd: "03:00",
    eventLabel: "Priority Escalation: J-10 Mast Pivot Overheating",
    event: [
      ["Event", "Priority escalation"],
      ["Job", "J-10 OHE mast pivot lubrication"],
      ["Change", "Tier 4 → Tier 2"],
      ["Rule", "Higher tier displaces lower tier inside the same protection"],
    ],
    changes: [
      "J-10 (now Tier 2) displaces J-09 (Tier 4) inside W1's protection",
      "Lamp batch defers — Tier rule applied mechanically, no exceptions",
      "W1 utilization rises; no extra possession needed",
    ],
    conflicts: [
      {
        id: "c1",
        code: "RESOURCE_CONFLICT",
        title: "Single Tower Wagon Contention in W1",
        detail: "Tower Wagon RU-04 cannot execute both routine bulb replacement and critical mast lubrication.",
        resolution: "Tier rulebook applied mechanically: Tier 2 (J-10) displaces Tier 4 (J-09).",
        corridor: "NDLS–GZB",
      },
    ],
    resources: [
      {
        id: "r1",
        name: "Tower Wagon RU-04",
        role: "TRD Northern Unit",
        corridor: "NDLS–GZB",
        initialState: "Assigned J-09 (Routine)",
        transitionalState: "Reassigning to urgent pivot",
        finalState: "Locked to J-10 Mast Pivot (T2)",
        tone: "primary",
        iconType: "wagon",
      },
      {
        id: "r2",
        name: "TRD Lubrication Crew",
        role: "Electrical Maintenance",
        corridor: "NDLS–GZB",
        initialState: "Off-duty roster",
        transitionalState: "Urgent call-out",
        finalState: "Deployed to Mast KM 18/4",
        tone: "ok",
        iconType: "crew",
      },
    ],
    apply: (s) => {
      const w1 = s.windows.find((w) => w.id === "W1");
      if (!w1) {
        defer(
          s,
          "J-10",
          "INSUFFICIENT_WINDOW",
          "W1 unavailable — raised-priority job cannot find a slot tonight."
        );
        return;
      }
      s.scheduled = s.scheduled.filter((j) => j.jobId !== "J-09");
      defer(
        s,
        "J-09",
        "LOWER_PRIORITY",
        "Raised-priority J-10 takes the parallel slot in W1."
      );
      s.scheduled.push({
        jobId: "J-10",
        windowId: "W1",
        minutes: 90,
        start: "02:00",
        end: "03:00",
        note: "parallel — raised to Tier 2",
      });
    },
  },
  {
    id: "restriction",
    label: "Operational restriction",
    detail: "Freight night curfew extended by 1 hour on the CNB end.",
    affectedCorridor: "TDL–CNB",
    eventTimeStart: "01:30",
    eventTimeEnd: "02:30",
    eventLabel: "Kanpur Freight Night Curfew Extension (+60 min)",
    event: [
      ["Event", "Curfew extension"],
      ["Corridor", "TDL–CNB (W2)"],
      ["Change", "Start delayed 01:30 → 02:30"],
      ["Rule", "Machine entry only after the curfew lifts"],
    ],
    changes: [
      "W2 start delayed 01:30 → 02:30 under the extended curfew",
      "J-04 ballast cleaning completes 2 of 3 passes only",
      "Machine entry re-timed — no other window affected",
    ],
    conflicts: [
      {
        id: "c1",
        code: "TRAIN_CONFLICT",
        title: "Extended Inbound Freight Curfew at CNB",
        detail: "Mainline occupied by delayed coal rake clearance until 02:30. Track machine access blocked.",
        resolution: "W2 start delayed 01:30 → 02:30; ballast cleaning shifts to start at 02:30.",
        corridor: "TDL–CNB",
      },
      {
        id: "c2",
        code: "RESOURCE_CONFLICT",
        title: "Compressed Machine Window for BCM-0932",
        detail: "Start postponed by 60 min. Total possession shrunk from 240 to 180 min.",
        resolution: "Machine completes 2 of 3 passes. Final pass deferred to next night.",
        corridor: "TDL–CNB",
      },
    ],
    resources: [
      {
        id: "r1",
        name: "BCM-0932 Ballast Cleaner",
        role: "Track Machinery NCR",
        corridor: "TDL–CNB",
        initialState: "Depot exit 01:00",
        transitionalState: "Held at TDL outer loop",
        finalState: "Entered track at 02:30 IST",
        tone: "warn",
        iconType: "machine",
      },
    ],
    apply: (s) => {
      const w2 = s.windows.find((w) => w.id === "W2");
      if (!w2) return;
      if (w2.minutes > 180) {
        w2.minutes = 180;
        w2.label = "TDL–CNB (DOWN) — curfew-delayed start";
        const j4 = s.scheduled.find((j) => j.jobId === "J-04");
        if (j4) {
          j4.start = "02:30";
          j4.end = "05:30";
          j4.minutes = 180;
          j4.note = "partial — 2 of 3 passes";
        }
        defer(
          s,
          "J-04",
          "INSUFFICIENT_WINDOW",
          "Extended freight curfew delays machine entry by one hour."
        );
      }
    },
  },
];

/* ------------------------------ derived stats ------------------------------ */

interface SimStats {
  blocks: number;
  jobs: number;
  deferred: number;
  utilization: number;
  impact: number;
}

function simStats(s: SimState): SimStats {
  const totalMinutes = s.windows.reduce((a, w) => a + w.minutes, 0);
  const occupied = s.windows.reduce(
    (a, w) =>
      a +
      occupiedUnion(
        s.scheduled
          .filter((j) => j.windowId === w.id)
          .map((j) => ({ start: j.start ?? "00:00", end: j.end ?? "00:00" }))
      ),
    0
  );
  return {
    blocks: s.windows.filter((w) => s.scheduled.some((j) => j.windowId === w.id))
      .length,
    jobs: s.scheduled.length,
    deferred: s.deferred.length,
    utilization: totalMinutes ? Math.round((occupied / totalMinutes) * 100) : 0,
    impact: s.impact.length,
  };
}

const utilTone = (u: number): string => (u >= 88 ? OK : u >= 75 ? WARN : CRIT);

function StatBlock({
  label,
  stats,
  tone,
  highlight,
}: {
  label: string;
  stats: SimStats;
  tone: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`p-4 transition-all duration-200 ${
        highlight
          ? "border-[#2e3092] bg-[#f5f6fc]/50 shadow-md ring-1 ring-[#2e3092]/30"
          : "border-[#e3e6f0]"
      }`}
    >
      <div
        className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.14em]"
        style={{ color: tone }}
      >
        {label}
      </div>
      <UtilBar pct={stats.utilization} tone={utilTone(stats.utilization)} />
      <div className="mt-3 grid grid-cols-2 gap-y-2 text-[11px]">
        <span className="text-[#878da1]">Possessions in use</span>
        <span className="text-right font-mono font-bold text-[#171a30]">
          {stats.blocks}
        </span>
        <span className="text-[#878da1]">Jobs scheduled</span>
        <span className="text-right font-mono font-bold text-[#171a30]">
          {stats.jobs}
        </span>
        <span className="text-[#878da1]">Jobs deferred</span>
        <span className="text-right font-mono font-bold text-[#171a30]">
          {stats.deferred}
        </span>
        <span className="text-[#878da1]">Operational impacts</span>
        <span className="text-right font-mono font-bold text-[#171a30]">
          {stats.impact}
        </span>
      </div>
    </Card>
  );
}

/* ----------------------------- simulation stages --------------------------- */

const PLAYBACK_STAGES = [
  { id: 0, label: "1. Baseline (r1)", hint: "Standard sanctioned night plan" },
  { id: 1, label: "2. Event Arrival", hint: "Operational disruption broadcast" },
  { id: 2, label: "3. Corridor Focus", hint: "Isolating affected block perimeter" },
  { id: 3, label: "4. Conflict Detection", hint: "Rulebook constraint evaluation" },
  { id: 4, label: "5. Resource Rebalance", hint: "Machines & gangs reassigned" },
  { id: 5, label: "6. Revised Plan (r2)", hint: "Optimized plan ready for officer" },
];

/* ------------------------------- component -------------------------------- */

interface SimulationProps {
  /** Scenario preloaded from elsewhere (e.g. the Planning Assistant). */
  initialScenario?: string | null;
  onSendToApproval: (note: string) => void;
}

export function Simulation({ initialScenario, onSendToApproval }: SimulationProps) {
  const [selectedId, setSelectedId] = useState<string | null>(initialScenario ?? null);
  const [ran, setRan] = useState(false);
  const [sent, setSent] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [stage, setStage] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);
  const [simClockMinutes, setSimClockMinutes] = useState(1320); // 22:00 in minutes (22 * 60)
  const [diffFilter, setDiffFilter] = useState<"all" | "changed" | "deferred" | "unchanged">("all");
  const [revealedConflictsCount, setRevealedConflictsCount] = useState<number>(0);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialScenario) {
      setSelectedId(initialScenario);
      setRan(true);
      setStage(5);
      setRevealedConflictsCount(3);
    }
  }, [initialScenario]);

  const base = useMemo(() => baseState(), []);
  const baseStats = useMemo(() => simStats(base), [base]);
  const scenario = SCENARIOS.find((s) => s.id === selectedId) ?? null;

  const after = useMemo(() => {
    if (!scenario) return null;
    const s = baseState();
    scenario.apply(s);
    return { state: s, stats: simStats(s) };
  }, [scenario]);

  const simulatedQualityMetrics = useMemo<PlannerQualityMetrics | null>(() => {
    if (!after) return null;
    const criticalOverdueCount = after.state.deferred.filter((d) => {
      const j = jobById(d.jobId);
      return j ? j.tier <= 2 : false;
    }).length;

    return {
      maintenanceCompleted: { scheduled: after.stats.jobs, total: jobs.length },
      criticalBacklog: criticalOverdueCount,
      blockUtilization: after.stats.utilization,
      trainImpact: `${after.stats.impact * 15} min`,
      possessionsUsed: after.stats.blocks,
      possessionsAvoided: Math.max(0, after.stats.jobs - after.stats.blocks),
      jobsScheduled: after.stats.jobs,
      jobsDeferred: after.stats.deferred,
      plannerStatus: "Feasible",
    };
  }, [after]);

  // Automated stage progression when playing
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = 2200 / playbackSpeed;
    timerRef.current = window.setInterval(() => {
      setStage((prev) => {
        const next = prev + 1;
        if (next > 5) {
          setIsPlaying(false);
          return 5;
        }

        // Fire toast notifications matching the stages
        if (scenario) {
          if (next === 1) {
            toast.info("Event Ingested", `${scenario.label}: ${scenario.eventLabel ?? scenario.detail}`);
            setSimClockMinutes(150); // 02:30 IST
          } else if (next === 2) {
            toast.warn("Corridor Focus", `Active highlight applied to ${scenario.affectedCorridor} corridor`);
          } else if (next === 3) {
            toast.warn("Conflicts Detected", `${scenario.conflicts.length} rulebook conflicts evaluated`);
            setRevealedConflictsCount(scenario.conflicts.length);
          } else if (next === 4) {
            toast.info("Resources Reassigned", `Gangs and machines rebalanced for ${scenario.affectedCorridor}`);
          } else if (next === 5) {
            toast.success("Plan r2 Ready", `Autonomous replanning complete: ${after?.stats.jobs} jobs scheduled`);
            setRan(true);
          }
        }
        return next;
      });
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, scenario, after]);

  const handleStartReplay = () => {
    setStage(0);
    setRevealedConflictsCount(0);
    setSimClockMinutes(1320); // 22:00
    setIsPlaying(true);
    setRan(true);
    toast.info("Replay Started", `Simulating operational replay for ${scenario?.label}`);
  };

  const handleResetReplay = () => {
    setIsPlaying(false);
    setStage(0);
    setRevealedConflictsCount(0);
    setSimClockMinutes(1320);
    toast.info("Replay Reset", "Returned to baseline plan r1.");
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setStage((prev) => {
      const next = Math.min(5, prev + 1);
      if (next === 3 && scenario) {
        setRevealedConflictsCount(scenario.conflicts.length);
      }
      if (next === 5) {
        setRan(true);
      }
      return next;
    });
  };

  // Convert clock minutes to HH:MM format
  const clockFormatted = useMemo(() => {
    const totalMinutes = (simClockMinutes + 1440) % 1440;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} IST`;
  }, [simClockMinutes]);

  // Compute job differences for Before vs After comparison
  const jobDiffs = useMemo(() => {
    if (!after) return [];
    return jobs.map((job) => {
      const baseSched = base.scheduled.find((s) => s.jobId === job.id);
      const afterSched = after.state.scheduled.find((s) => s.jobId === job.id);
      const baseDef = base.deferred.find((d) => d.jobId === job.id);
      const afterDef = after.state.deferred.find((d) => d.jobId === job.id);

      let status: "unchanged" | "changed" | "deferred" | "newly_scheduled" = "unchanged";
      let deltaNote = "Preserved identical slot";

      if (baseSched && !afterSched) {
        status = "deferred";
        deltaNote = afterDef ? `Deferred: ${afterDef.reason}` : "Deferred tonight";
      } else if (!baseSched && afterSched) {
        status = "newly_scheduled";
        deltaNote = `Inserted into ${afterSched.windowId} (${afterSched.start}–${afterSched.end})`;
      } else if (baseSched && afterSched) {
        if (baseSched.start !== afterSched.start || baseSched.end !== afterSched.end) {
          status = "changed";
          deltaNote = `Shifted ${baseSched.start} → ${afterSched.start} (${afterSched.note ?? "re-timed"})`;
        }
      }

      return {
        job,
        status,
        deltaNote,
        before: baseSched ? `${baseSched.windowId} · ${baseSched.start}–${baseSched.end}` : baseDef ? `Deferred (${baseDef.code})` : "Unassigned",
        after: afterSched ? `${afterSched.windowId} · ${afterSched.start}–${afterSched.end}` : afterDef ? `Deferred (${afterDef.code})` : "Unassigned",
      };
    });
  }, [base, after]);

  const filteredDiffs = useMemo(() => {
    if (diffFilter === "all") return jobDiffs.filter((d) => d.before !== "Unassigned" || d.after !== "Unassigned");
    if (diffFilter === "changed") return jobDiffs.filter((d) => d.status === "changed" || d.status === "newly_scheduled");
    if (diffFilter === "deferred") return jobDiffs.filter((d) => d.status === "deferred");
    if (diffFilter === "unchanged") return jobDiffs.filter((d) => d.status === "unchanged" && d.before !== "Unassigned");
    return jobDiffs;
  }, [jobDiffs, diffFilter]);

  const activeCorridor = scenario?.affectedCorridor;

  return (
    <div className="space-y-4">
      <ToastContainer />

      <SectionHeader
        title="Simulation & Operational Replay Studio"
        subtitle="Step through dynamic operational disruptions: BEFORE (r1) → EVENT → AFTER (r2) with interactive timeline scrubber and corridor highlight."
      />

      {/* Scenario picker */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        {SCENARIOS.map((sc) => {
          const on = selectedId === sc.id;
          return (
            <button
              key={sc.id}
              onClick={() => {
                setSelectedId(sc.id);
                setRan(false);
                setSent(false);
                setStage(0);
                setIsPlaying(false);
                setRevealedConflictsCount(0);
                toast.info("Scenario Selected", sc.label);
              }}
              className={`hover-lift group focus-primary rounded-xl border p-3 text-left transition-all duration-200 ${
                on
                  ? "border-[#2e3092] bg-[#eef0fa] shadow-sm ring-1 ring-[#2e3092]/30"
                  : "border-[#e3e6f0] bg-white hover:border-[#c9cde8]"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-extrabold text-[#171a30] transition-colors group-hover:text-[#2e3092]">
                  {on ? "✓ " : "+ "}
                  {sc.label}
                </span>
                <span className="rounded bg-[#171a30]/5 px-1 py-0.5 font-mono text-[8px] font-bold text-[#4d5468]">
                  {sc.affectedCorridor}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-[#878da1] line-clamp-2">
                {sc.detail}
              </p>
            </button>
          );
        })}
      </div>

      {/* Configuration & Replay Studio Bar */}
      {scenario && (
        <Card className="border-[#2e3092]/40 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f6] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#2e3092]">
                  Interactive Replay Engine
                </span>
                <span className="rounded-full bg-[#2e3092]/10 px-2 py-0.5 font-mono text-[9px] font-bold text-[#2e3092]">
                  {scenario.label}
                </span>
                <span className="rounded-full bg-[#d97706]/15 px-2 py-0.5 font-mono text-[9px] font-bold text-[#92400e]">
                  Impacts: {scenario.affectedCorridor}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-[#4d5468]">
                {scenario.detail}
              </p>
            </div>

            {/* Replay Controls */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg border border-[#e3e6f0] bg-[#f6f7fb] p-1">
                <button
                  type="button"
                  onClick={handleResetReplay}
                  title="Reset Replay"
                  className="rounded p-1 text-[#4d5468] hover:bg-white hover:text-[#171a30] transition-colors"
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false);
                    } else if (stage >= 5 || stage === 0) {
                      handleStartReplay();
                    } else {
                      setIsPlaying(true);
                      setRan(true);
                    }
                  }}
                  className="flex items-center gap-1 rounded bg-[#2e3092] px-2.5 py-1 text-xs font-bold text-white hover:bg-[#24266f] transition-all"
                >
                  {isPlaying ? (
                    <>
                      <Pause size={13} /> Pause
                    </>
                  ) : (
                    <>
                      <Play size={13} /> {stage === 0 ? "Play Replay" : "Resume"}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleStepForward}
                  title="Step Forward"
                  className="rounded p-1 text-[#4d5468] hover:bg-white hover:text-[#171a30] transition-colors"
                >
                  <StepForward size={14} />
                </button>
              </div>

              {/* Speed toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-[#e3e6f0] bg-[#f6f7fb] px-2 py-1 text-[10px] font-bold">
                <span className="text-[#878da1]">Speed:</span>
                {([1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`rounded px-1.5 py-0.5 ${
                      playbackSpeed === spd
                        ? "bg-[#2e3092] text-white"
                        : "text-[#4d5468] hover:bg-white"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              <Button
                variant={ran ? "secondary" : "primary"}
                onClick={() => {
                  setStage(5);
                  setRan(true);
                  setRevealedConflictsCount(scenario.conflicts.length);
                  toast.success("Simulation Computed", "Jumped directly to optimized plan r2.");
                }}
              >
                {ran ? "Re-evaluate plan" : "Fast-forward to r2"}
              </Button>
            </div>
          </div>

          {/* Staged Replay Progress Tracker */}
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {PLAYBACK_STAGES.map((s) => {
                const isPassed = stage >= s.id;
                const isCurrent = stage === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setStage(s.id);
                      setIsPlaying(false);
                      if (s.id >= 3) {
                        setRevealedConflictsCount(scenario.conflicts.length);
                      }
                      if (s.id === 5) setRan(true);
                    }}
                    className={`rounded-lg border p-2 text-left transition-all duration-200 ${
                      isCurrent
                        ? "border-[#2e3092] bg-[#eef0fa] shadow-xs"
                        : isPassed
                          ? "border-[#16a34a]/30 bg-[#f0fdf4]/50"
                          : "border-[#e3e6f0] bg-white opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-[9px] font-extrabold uppercase ${
                          isCurrent
                            ? "text-[#2e3092]"
                            : isPassed
                              ? "text-[#166534]"
                              : "text-[#878da1]"
                        }`}
                      >
                        {s.label}
                      </span>
                      {isPassed && !isCurrent && (
                        <CheckCircle2 size={11} className="text-[#16a34a]" />
                      )}
                      {isCurrent && (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[#2e3092]" />
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[9px] text-[#4d5468]">
                      {s.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Target Corridor Visual Highlight Strip */}
      {scenario && (
        <Card className="p-4 bg-white">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#878da1]">
                Active Network Corridor Status
              </span>
              <span className="font-mono text-[10px] text-[#878da1]">
                Simulated Clock: <span className="font-bold text-[#171a30]">{clockFormatted}</span>
              </span>
            </div>
            <div className="text-[10px] text-[#878da1]">
              Targeted corridor isolation active · non-affected corridors preserved calm
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {(["NDLS–GZB", "TDL–CNB", "PRYJ–DDU"] as const).map((corr) => {
              const isAffected = activeCorridor === corr;
              const isEventStage = stage >= 1;

              return (
                <div
                  key={corr}
                  className={`rounded-xl border p-3 transition-all duration-300 ${
                    isAffected && isEventStage
                      ? "corridor-active-glow bg-[#eef0fa]/50"
                      : "border-[#e3e6f0] bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#171a30]">{corr}</span>
                    {isAffected && isEventStage ? (
                      <span className="flex items-center gap-1 rounded bg-[#2e3092] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-white animate-pulse">
                        <AlertTriangle size={9} /> Impact Zone
                      </span>
                    ) : (
                      <span className="rounded bg-[#f1f3f9] px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#4d5468]">
                        Calm / Normal
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-[#4d5468]">
                    {corr === "NDLS–GZB"
                      ? "Window W1 (180m UP)"
                      : corr === "TDL–CNB"
                        ? "Window W2 (240m DOWN)"
                        : "Window W3 (285m UP)"}
                  </div>
                  {isAffected && isEventStage && (
                    <div className="mt-1.5 text-[10px] font-semibold text-[#2e3092]">
                      ● Event active: {scenario.eventLabel ?? scenario.event[0][1]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Interactive Timeline Playback with moving indicator */}
      {scenario && (
        <Card className="p-4 bg-white">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-[#2e3092]" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#171a30]">
                Timeline Playback Strip (22:00 → 07:00 IST)
              </span>
            </div>
            {/* Scrubber slider */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#878da1]">Time Scrubber:</span>
              <input
                type="range"
                min="0"
                max="540"
                step="15"
                value={(simClockMinutes >= 1320 ? simClockMinutes - 1320 : simClockMinutes + 120)}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  const newMins = val <= 120 ? 1320 + val : val - 120;
                  setSimClockMinutes(newMins);
                }}
                className="h-1.5 w-32 sm:w-44 accent-[#2e3092] cursor-pointer"
              />
              <span className="font-mono text-[10px] font-bold text-[#2e3092]">
                {clockFormatted}
              </span>
            </div>
          </div>

          {/* Timeline visualization */}
          <div className="relative mt-3 rounded-lg border border-[#e3e6f0] bg-[#fafbfd] p-3">
            {/* Hours ticks */}
            <div className="mb-2 flex justify-between border-b border-[#eef0f6] pb-1 font-mono text-[9px] text-[#878da1]">
              <span>22:00</span>
              <span>23:00</span>
              <span>00:00</span>
              <span>01:00</span>
              <span>02:00</span>
              <span>03:00</span>
              <span>04:00</span>
              <span>05:00</span>
              <span>06:00</span>
              <span>07:00</span>
            </div>

            {/* Corridor Timeline Lanes */}
            <div className="space-y-2">
              {/* Lane 1: NDLS–GZB */}
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 font-mono text-[10px] font-bold text-[#171a30]">
                  NDLS–GZB
                </span>
                <div className="relative h-7 flex-1 rounded bg-[#f1f3f9]">
                  {/* W1 Window Base */}
                  <div className="absolute top-1 bottom-1 left-[33%] w-[33%] rounded border border-dashed border-[#2e3092]/50 bg-[#eef0fa] px-1 text-[8px] font-bold text-[#2e3092]">
                    W1 (01:00–04:00)
                  </div>
                  {/* Scheduled Job J-02 */}
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded bg-[#2e3092] px-1 text-[8px] font-bold text-white transition-all duration-500 ease-out"
                    style={{
                      left: stage >= 2 && selectedId === "relief" ? "33%" : "44%",
                      width: "16%",
                    }}
                  >
                    J-02 Weld
                  </div>
                  {/* Scheduled Job J-09 */}
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded bg-[#4d5468] px-1 text-[8px] font-bold text-white transition-all duration-500 ease-out"
                    style={{
                      left: stage >= 2 && selectedId === "relief" ? "33%" : "44%",
                      width: "11%",
                      display: stage >= 3 && selectedId === "priority" ? "none" : "block",
                    }}
                  >
                    J-09 Lamp
                  </div>
                  {/* Priority Displaced Job J-10 */}
                  {selectedId === "priority" && stage >= 3 && (
                    <div className="absolute top-1.5 bottom-1.5 left-[44%] w-[16%] rounded bg-[#16a34a] px-1 text-[8px] font-bold text-white animate-in zoom-in-95">
                      J-10 Pivot (T2)
                    </div>
                  )}
                  {/* Event Protected Relief Train */}
                  {selectedId === "relief" && stage >= 1 && (
                    <div className="absolute top-1 bottom-1 left-[50%] w-[11%] rounded bg-[#dc2626] px-1 text-[8px] font-bold text-white animate-pulse">
                      Special 00214
                    </div>
                  )}
                </div>
              </div>

              {/* Lane 2: TDL–CNB */}
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 font-mono text-[10px] font-bold text-[#171a30]">
                  TDL–CNB
                </span>
                <div className="relative h-7 flex-1 rounded bg-[#f1f3f9]">
                  {/* W2 Window */}
                  <div
                    className="absolute top-1 bottom-1 rounded border border-dashed border-[#2e3092]/50 bg-[#eef0fa] px-1 text-[8px] font-bold text-[#2e3092] transition-all duration-500"
                    style={{
                      left: selectedId === "restriction" && stage >= 2 ? "50%" : "38%",
                      width: selectedId === "reduce" && stage >= 2 ? "33%" : "44%",
                    }}
                  >
                    W2
                  </div>
                  {/* J-04 Ballast Cleaning */}
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded bg-[#2e3092] px-1 text-[8px] font-bold text-white transition-all duration-500"
                    style={{
                      left: selectedId === "restriction" && stage >= 2 ? "50%" : "38%",
                      width: (selectedId === "reduce" || selectedId === "restriction") && stage >= 2 ? "33%" : "44%",
                    }}
                  >
                    J-04 Ballast Clean {(selectedId === "reduce" || selectedId === "restriction") && stage >= 2 ? "(2 passes)" : "(3 passes)"}
                  </div>
                </div>
              </div>

              {/* Lane 3: PRYJ–DDU */}
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 font-mono text-[10px] font-bold text-[#171a30]">
                  PRYJ–DDU
                </span>
                <div className="relative h-7 flex-1 rounded bg-[#f1f3f9]">
                  {selectedId === "remove" && stage >= 2 ? (
                    <div className="absolute inset-1 flex items-center justify-center rounded border border-dashed border-[#dc2626]/50 bg-[#fef2f2] text-[9px] font-bold text-[#dc2626]">
                      Window W3 Withdrawn (Junction Track Circuit Failure)
                    </div>
                  ) : (
                    <>
                      <div className="absolute top-1 bottom-1 left-[38%] w-[52%] rounded border border-dashed border-[#2e3092]/50 bg-[#eef0fa] px-1 text-[8px] font-bold text-[#2e3092]">
                        W3
                      </div>
                      <div className="absolute top-1.5 bottom-1.5 left-[38%] w-[16%] rounded bg-[#2e3092] px-1 text-[8px] font-bold text-white">
                        J-05 Track
                      </div>
                      <div className="absolute top-1.5 bottom-1.5 left-[58%] w-[32%] rounded bg-[#4d5468] px-1 text-[8px] font-bold text-white">
                        J-07 Axle Counter
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Dynamic Resource Reallocation Transitions */}
      {scenario && stage >= 2 && (
        <Card className="p-4 bg-white">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench size={14} className="text-[#2e3092]" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#171a30]">
                Dynamic Resource & Machinery Transitions
              </span>
            </div>
            <span className="font-mono text-[9px] text-[#878da1]">
              Rulebook Compatibility Dispatch
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {scenario.resources.map((res) => {
              const currentStatus =
                stage >= 4 ? res.finalState : stage >= 2 ? res.transitionalState : res.initialState;
              const badgeTone = stage >= 4 ? (res.tone === "crit" ? "crit" : "ok") : "warn";

              return (
                <div
                  key={res.id}
                  className="hover-lift rounded-xl border border-[#e3e6f0] bg-[#fafbfd] p-3 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#171a30]">{res.name}</span>
                    <span className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase text-[#4d5468] bg-[#f1f3f9]">
                      {res.role}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-1.5 text-[10px]">
                    <span className="text-[#878da1] line-through truncate max-w-[45%]">
                      {res.initialState}
                    </span>
                    <ArrowRight size={11} className="text-[#878da1] shrink-0" />
                    <span
                      className={`font-semibold transition-all duration-300 ${
                        badgeTone === "ok"
                          ? "text-[#166534]"
                          : badgeTone === "warn"
                            ? "text-[#92400e]"
                            : "text-[#991b1b]"
                      }`}
                    >
                      {currentStatus}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[9px] text-[#878da1] border-t border-[#eef0f6] pt-1.5">
                    <span>Corridor: {res.corridor}</span>
                    <span className="font-mono font-bold">
                      {stage >= 4 ? "State locked ✓" : "Transitioning..."}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Progressive Conflict Reveal Panel */}
      {scenario && stage >= 3 && scenario.conflicts.length > 0 && (
        <Card className="border-[#d97706]/40 bg-[#fffbeb]/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={15} className="text-[#d97706]" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#d97706]">
                Autonomous Conflict Reveal & Resolution Rules
              </span>
            </div>
            <span className="font-mono text-[9px] text-[#92400e]">
              Evaluating constraints ({revealedConflictsCount}/{scenario.conflicts.length})
            </span>
          </div>

          <div className="space-y-2 mt-2">
            {scenario.conflicts.slice(0, revealedConflictsCount || scenario.conflicts.length).map((c, idx) => (
              <div
                key={c.id}
                className="animate-conflict-reveal rounded-lg border border-[#fde68a] bg-white p-3 shadow-xs"
                style={{ animationDelay: `${idx * 120}ms` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase ${
                        c.code === "TRAIN_CONFLICT"
                          ? "bg-[#fef2f2] text-[#dc2626] border border-[#dc2626]/30"
                          : c.code === "RESOURCE_CONFLICT"
                            ? "bg-[#eef0fa] text-[#2e3092] border border-[#2e3092]/30"
                            : "bg-[#fffbeb] text-[#d97706] border border-[#d97706]/30"
                      }`}
                    >
                      {c.code}
                    </span>
                    <span className="text-xs font-bold text-[#171a30]">{c.title}</span>
                  </div>
                  <span className="font-mono text-[9px] text-[#878da1]">{c.corridor}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#4d5468]">{c.detail}</p>
                <div className="mt-1.5 flex items-start gap-1 rounded bg-[#f5f6fc] px-2 py-1 text-[10px] text-[#2e3092]">
                  <span className="font-bold shrink-0">Resolution:</span>
                  <span>{c.resolution}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Result — BEFORE → EVENT → AFTER (§14 Core Flow) */}
      {scenario && ran && after && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <StatBlock label="Before (Baseline r1)" stats={baseStats} tone={NEUTRAL} />

            <Card className="border-[#d97706]/50 bg-[#fffbeb] p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#d97706]">
                  Event Ingestion
                </span>
                <span className="rounded bg-[#d97706]/20 px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#92400e]">
                  Active
                </span>
              </div>
              <div className="space-y-1.5">
                {scenario.event.map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-[#b45309]">
                      {k}
                    </div>
                    <div className="text-[11px] font-semibold text-[#171a30]">{v}</div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[#92400e]">
                Simulated event — the replan engine re-fits every job against the tier rulebook before anything is proposed.
              </p>
            </Card>

            <StatBlock
              label="After (Revised r2)"
              stats={after.stats}
              tone={PRIMARY}
              highlight
            />
          </div>

          {/* Planning Quality Dashboard for Simulated Scenario */}
          {simulatedQualityMetrics && (
            <div>
              <PlanningQualityDashboard
                metrics={simulatedQualityMetrics}
                title={`Simulated Plan Quality · ${scenario.label}`}
                plannerStatus="Feasible"
                sourceHint="Simulated Replan Engine · Advisory Only"
              />
            </div>
          )}

          {/* Before vs After Granular Comparison */}
          <Card className="p-4 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef0f6] pb-3 mb-3">
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#171a30]">
                  Before vs After Comparison Matrix
                </h3>
                <p className="text-[10px] text-[#878da1]">
                  Visual diff highlighting shifted times, preserved slots, and deferred works
                </p>
              </div>

              {/* Diff Filters */}
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: "all", label: "All Works" },
                    { id: "changed", label: "Changed" },
                    { id: "deferred", label: "Deferred" },
                    { id: "unchanged", label: "Unchanged" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setDiffFilter(f.id)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors ${
                      diffFilter === f.id
                        ? "bg-[#2e3092] text-white"
                        : "bg-[#f1f3f9] text-[#4d5468] hover:bg-[#eef0fa]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {filteredDiffs.map(({ job, status, deltaNote, before, after: afterSlot }) => (
                <div
                  key={job.id}
                  className={`hover-lift flex flex-wrap items-center justify-between gap-3 rounded-lg border p-2.5 transition-all duration-150 ${
                    status === "changed"
                      ? "border-[#2e3092]/30 bg-[#eef0fa]/40"
                      : status === "deferred"
                        ? "border-[#fde68a] bg-[#fffbeb]/40"
                        : "border-[#e3e6f0] bg-white opacity-85"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <TierChip tier={job.tier} compact />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-[#171a30]">
                          {job.id}
                        </span>
                        <span className="text-xs text-[#171a30]">{job.title}</span>
                      </div>
                      <div className="text-[10px] text-[#878da1]">{deltaNote}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[11px]">
                    <div className="text-right">
                      <span className="text-[9px] uppercase tracking-wider text-[#878da1] block">
                        Before (r1)
                      </span>
                      <span className="font-mono text-[#4d5468]">{before}</span>
                    </div>

                    <ArrowRight size={13} className="text-[#878da1]" />

                    <div className="text-right min-w-[120px]">
                      <span className="text-[9px] uppercase tracking-wider text-[#878da1] block">
                        After (r2)
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          status === "deferred"
                            ? "text-[#dc2626]"
                            : status === "changed"
                              ? "text-[#2e3092]"
                              : "text-[#16a34a]"
                        }`}
                      >
                        {afterSlot}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Scenario notes dropdown */}
            <div className="mt-3">
              <Collapse title="View reasoning — full scenario notes">
                <div className="mb-2 text-[11px] font-bold text-[#171a30]">
                  {scenario.label}
                </div>
                <ul className="space-y-1 text-[#4d5468]">
                  {scenario.changes.map((c) => (
                    <li key={c}>· {c}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] italic text-[#878da1]">
                  {scenario.detail}
                </p>
              </Collapse>
            </div>
          </Card>

          {/* Send the revised plan onward — the officer still approves it */}
          <Card className="flex flex-wrap items-center justify-between gap-3 border-[#2e3092]/40 bg-white p-4 shadow-sm">
            <div>
              <div className="text-xs font-bold text-[#171a30]">
                Revised plan (r2) ready for authorization
              </div>
              <div className="text-[11px] text-[#878da1]">
                After-state computed — {after.stats.jobs} jobs scheduled ·{" "}
                {after.stats.deferred} deferred · {after.stats.utilization}% utilized.
                The officer authorizes in Human Approval.
              </div>
            </div>
            <Button
              disabled={sent}
              onClick={() => {
                setSent(true);
                toast.success(
                  "Sent to Human Approval",
                  `${scenario.label} plan revision submitted.`
                );
                onSendToApproval(
                  `${scenario.label} applied — ${scenario.changes[0]}`
                );
              }}
            >
              {sent ? "Sent to approval ✓" : "Send revised plan to approval →"}
            </Button>
          </Card>
        </>
      )}

      {!scenario && (
        <Card className="p-10 text-center text-xs italic text-[#878da1]">
          Select an operational event above to initiate interactive replay and conflict evaluation.
        </Card>
      )}
    </div>
  );
}

export default Simulation;