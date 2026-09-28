// ---------------------------------------------------------------------------
// APPROVAL & HISTORY DOMAIN DATA & REASONING ENGINE
// Grounded in real railway operations & planner outputs.
// No prominent technical revision identifiers (r1/r2/r3) in primary UI.
// ---------------------------------------------------------------------------

export type OfficerPlanStatus =
  | "Pending Approval"
  | "Approved"
  | "Modified"
  | "Rejected"
  | "Locked";

export interface BundledJob {
  id: string;
  title: string;
  dept: "Engineering" | "S&T" | "TRD";
  asset: string;
  durationMinutes: number;
  timeWindow: string;
  tier: number;
  tierLabel: string;
  parallel?: boolean;
}

export interface ProposedBlock {
  id: string; // W1, W2, W3
  name: string;
  section: string;
  track: string;
  direction: "UP" | "DOWN" | "SINGLE";
  date: string;
  timeWindow: string;
  durationMinutes: number;
  status: OfficerPlanStatus;
  bundledJobs: BundledJob[];
  whyGrouped: {
    summary: string;
    points: string[];
    trafficSafety: string;
  };
}

export interface ReviewIssue {
  id: string;
  jobId: string;
  title: string;
  dept: "Engineering" | "S&T" | "TRD";
  status: "Deferred" | "Resource conflict" | "Train conflict" | "Review required";
  reason: string;
  nextFeasible: string;
  consequence: string;
  suggestedAction: string;
}

export interface FeasibleAlternative {
  id: string;
  targetType: "block" | "job" | "deferred" | "issue";
  targetId: string;
  date: string;
  windowLabel: string;
  timeWindow: string;
  feasible: boolean;
  feasibilityTag: "Feasible" | "Caution" | "Infeasible";
  infeasibleReason?: string;
  fitSummary: string;
  expectedTrainImpactMinutes: number;
  expectedImpactDeltaMinutes: number;
  trainDelaySummary: string;
  scheduledDelta: number;
  deferredDelta: number;
}

export interface DraftChange {
  id: string;
  targetType: "block" | "job" | "deferred" | "issue";
  targetId: string;
  targetTitle: string;
  previousAllocation: string;
  newAllocation: string;
  expectedTrainImpactChange: string;
  jobsCountChange: string;
  timestamp: string;
}

export interface HumanPlanHistoryItem {
  id: string;
  title: string; // "Current Plan Revision" | "Previous Plan Revision"
  date: string;
  status: OfficerPlanStatus | "Superseded";
  reason: string;
  officer: string;
  technicalRevisionRef?: string; // secondary metadata only, e.g. "Rev 3"
}

// Canonical proposed blocks for 17 Sep 2026 Night Maintenance Plan
export const PROPOSED_BLOCKS: ProposedBlock[] = [
  {
    id: "W1",
    name: "W1",
    section: "NDLS–GZB",
    track: "UP TRACK",
    direction: "UP",
    date: "17 Sep 2026",
    timeWindow: "01:00–04:00",
    durationMinutes: 180,
    status: "Pending Approval",
    bundledJobs: [
      {
        id: "J-02",
        title: "Rail fracture weld repair",
        dept: "Engineering",
        asset: "UP rail KM 18/4 (52 kg / 90 UTS)",
        durationMinutes: 90,
        timeWindow: "01:00–02:30",
        tier: 1,
        tierLabel: "Tier 1 Safety Critical",
      },
      {
        id: "J-09",
        title: "Signal lamp replacement",
        dept: "S&T",
        asset: "Signals S/12 · S/18 · S/24",
        durationMinutes: 60,
        timeWindow: "01:00–02:00",
        tier: 4,
        tierLabel: "Tier 4 Routine",
        parallel: true,
      },
      {
        id: "J-13",
        title: "Motor trolley patrol",
        dept: "Engineering",
        asset: "KM 10–24 track & trolley refuges",
        durationMinutes: 45,
        timeWindow: "02:30–03:15",
        tier: 4,
        tierLabel: "Tier 4 Inspection",
      },
    ],
    whyGrouped: {
      summary: "Combined track repair, parallel signaling maintenance, and trolley inspection in one traffic window.",
      points: [
        "Compatible work methods — S&T line-side lamp party operates under shared shadow protection with P-Way weld team.",
        "Required power isolation is compatible across all 3 activities.",
        "Required resources (REMM-2 welding set, S&T lamp party) are available simultaneously.",
        "All work fits safely within the 180-min possession window without encroaching the morning Rajdhani convoy.",
      ],
      trafficSafety: "Protected gap between Mumbai Rajdhani (12951) clear and early port freight release at 05:15.",
    },
  },
  {
    id: "W2",
    name: "W2",
    section: "TDL–CNB",
    track: "DOWN TRACK",
    direction: "DOWN",
    date: "17 Sep 2026",
    timeWindow: "01:30–05:30",
    durationMinutes: 240,
    status: "Pending Approval",
    bundledJobs: [
      {
        id: "J-04",
        title: "Ballast cleaning (BCM) — deep screening",
        dept: "Engineering",
        asset: "DOWN track KM 121/8–125/2",
        durationMinutes: 240,
        timeWindow: "01:30–05:30",
        tier: 2,
        tierLabel: "Tier 2 Track Geometry",
      },
      {
        id: "J-12",
        title: "Cable route inspection & marking",
        dept: "S&T",
        asset: "CNB yard cable ducts",
        durationMinutes: 90,
        timeWindow: "01:30–03:00",
        tier: 4,
        tierLabel: "Tier 4 Routine",
        parallel: true,
      },
    ],
    whyGrouped: {
      summary: "Heavy machine deep screening coupled with non-interfering parallel cable duct marking.",
      points: [
        "Compatible work methods — cable route inspection runs parallel outside machine swing envelope.",
        "Sanctioned night corridor possession — eliminates secondary track booking and redundant isolation.",
        "BCM-03 and ballast regulator available and confirmed on-site.",
        "Full 240-minute window accommodates machine entry, continuous screening, and exit buffer.",
      ],
      trafficSafety: "Scheduled after BCNA goods clear; single freight held 15 min at TDL.",
    },
  },
  {
    id: "W3",
    name: "W3",
    section: "PRYJ–DDU",
    track: "UP TRACK",
    direction: "UP",
    date: "17 Sep 2026",
    timeWindow: "02:00–05:00",
    durationMinutes: 180,
    status: "Pending Approval",
    bundledJobs: [
      {
        id: "J-05",
        title: "OHE auto-tension adjustment",
        dept: "TRD",
        asset: "Regulation anchor KM 88/6",
        durationMinutes: 90,
        timeWindow: "02:00–03:30",
        tier: 2,
        tierLabel: "Tier 2 Preventive",
      },
      {
        id: "J-07",
        title: "Axle counter renewal (EERC)",
        dept: "S&T",
        asset: "PRYJ block section DC axle counters",
        durationMinutes: 90,
        timeWindow: "03:30–05:00",
        tier: 3,
        tierLabel: "Tier 3 Reliability",
      },
    ],
    whyGrouped: {
      summary: "Sequential TRD overhead tension adjustment followed by S&T axle counter calibration.",
      points: [
        "Compatible work methods — overhead line adjustment coordinated with track-side S&T calibration without interference.",
        "TRD power feed isolation safely shared for anchor adjustments before power re-certification.",
        "Tower wagon TW-925 and S&T EERC party coordinated sequentially to prevent work clutter.",
        "Fits within lean freight traffic window prior to morning junction movements.",
      ],
      trafficSafety: "Safely clears ahead of CONCOR-2210 container movement.",
    },
  },
];

// Key review issues that can affect officer decision
export const ISSUES_TO_REVIEW: ReviewIssue[] = [
  {
    id: "ISS-01",
    jobId: "J-05",
    title: "OHE auto-tension adjustment",
    dept: "TRD",
    status: "Deferred",
    reason: "Train conflict",
    nextFeasible: "23 Sep",
    consequence: "Anchor tension running near tolerance; pantograph wear rate slightly accelerated.",
    suggestedAction: "Reconsider if window can be slotted on 23 Sep (W2, 04:10–05:30) with minor freight regulation.",
  },
  {
    id: "ISS-02",
    jobId: "J-06",
    title: "Girder bridge bearing inspection",
    dept: "Engineering",
    status: "Deferred",
    reason: "Resource conflict",
    nextFeasible: "24 Sep",
    consequence: "Mandatory 90-day post-monsoon inspection deferred pending REMM crane return from POH.",
    suggestedAction: "Slot on 24 Sep when REMM access crane returns, or relocate to W3 if crane can be shared.",
  },
  {
    id: "ISS-03",
    jobId: "J-10",
    title: "Cable route inspection & marking",
    dept: "S&T",
    status: "Review required",
    reason: "Resource conflict",
    nextFeasible: "24 Sep",
    consequence: "Parallel crew required at CNB yard; conflicting roster with S&T lamp party.",
    suggestedAction: "Review crew allocation or approve deferral to next routine inspection cycle.",
  },
];

// Feasible system-generated alternatives for Modify mode
export const SYSTEM_ALTERNATIVES: Record<string, FeasibleAlternative[]> = {
  // Alternatives for W1 block
  W1: [
    {
      id: "ALT-W1-1",
      targetType: "block",
      targetId: "W1",
      date: "17 Sep",
      windowLabel: "17 Sep · 04:10–05:30",
      timeWindow: "04:10–05:30",
      feasible: true,
      feasibilityTag: "Feasible",
      fitSummary: "✓ All 3 jobs fit",
      expectedTrainImpactMinutes: 33,
      expectedImpactDeltaMinutes: 8,
      trainDelaySummary: "Expected impact: +8 min (1 freight regulated)",
      scheduledDelta: 0,
      deferredDelta: 0,
    },
    {
      id: "ALT-W1-2",
      targetType: "block",
      targetId: "W1",
      date: "18 Sep",
      windowLabel: "18 Sep · 01:30–04:30",
      timeWindow: "01:30–04:30",
      feasible: true,
      feasibilityTag: "Feasible",
      fitSummary: "✓ All 3 jobs fit",
      expectedTrainImpactMinutes: 18,
      expectedImpactDeltaMinutes: -7,
      trainDelaySummary: "Lower train impact (no freight regulation)",
      scheduledDelta: 0,
      deferredDelta: 0,
    },
    {
      id: "ALT-W1-3",
      targetType: "block",
      targetId: "W1",
      date: "19 Sep",
      windowLabel: "19 Sep · 02:00–05:00",
      timeWindow: "02:00–05:00",
      feasible: false,
      feasibilityTag: "Caution",
      infeasibleReason: "⚠ J-13 trolley patrol must move to adjacent day due to track circuit testing",
      fitSummary: "⚠ One job must move",
      expectedTrainImpactMinutes: 28,
      expectedImpactDeltaMinutes: 3,
      trainDelaySummary: "Expected impact: +3 min",
      scheduledDelta: -1,
      deferredDelta: 1,
    },
    {
      id: "ALT-W1-4",
      targetType: "block",
      targetId: "W1",
      date: "17 Sep",
      windowLabel: "17 Sep · 02:30–03:30",
      timeWindow: "02:30–03:30",
      feasible: false,
      feasibilityTag: "Infeasible",
      infeasibleReason: "✕ Insufficient duration (60 min available vs 180 min required)",
      fitSummary: "✕ Window too short",
      expectedTrainImpactMinutes: 25,
      expectedImpactDeltaMinutes: 0,
      trainDelaySummary: "Operationally invalid",
      scheduledDelta: 0,
      deferredDelta: 0,
    },
  ],
  // Alternatives for J-05 job
  "J-05": [
    {
      id: "ALT-J05-1",
      targetType: "job",
      targetId: "J-05",
      date: "23 Sep",
      windowLabel: "23 Sep · W2 · 04:10–05:30",
      timeWindow: "04:10–05:30",
      feasible: true,
      feasibilityTag: "Feasible",
      fitSummary: "✓ Feasible (power isolation approved for 23 Sep)",
      expectedTrainImpactMinutes: 33,
      expectedImpactDeltaMinutes: 8,
      trainDelaySummary: "Expected impact: +8 min train impact",
      scheduledDelta: 1,
      deferredDelta: -1,
    },
    {
      id: "ALT-J05-2",
      targetType: "job",
      targetId: "J-05",
      date: "24 Sep",
      windowLabel: "24 Sep · W3 · 02:00–03:30",
      timeWindow: "02:00–03:30",
      feasible: true,
      feasibilityTag: "Feasible",
      fitSummary: "✓ Feasible (tower wagon TW-925 idle)",
      expectedTrainImpactMinutes: 30,
      expectedImpactDeltaMinutes: 5,
      trainDelaySummary: "Expected impact: +5 min train impact",
      scheduledDelta: 1,
      deferredDelta: -1,
    },
    {
      id: "ALT-J05-3",
      targetType: "job",
      targetId: "J-05",
      date: "17 Sep",
      windowLabel: "17 Sep · W1 · 02:30–04:00",
      timeWindow: "02:30–04:00",
      feasible: false,
      feasibilityTag: "Infeasible",
      infeasibleReason: "✕ Isolation conflict — PRYJ power dispatch limits concurrent feeds",
      fitSummary: "✕ Simultaneous isolation denied",
      expectedTrainImpactMinutes: 25,
      expectedImpactDeltaMinutes: 0,
      trainDelaySummary: "Operationally invalid",
      scheduledDelta: 0,
      deferredDelta: 0,
    },
  ],
  // Alternatives for J-06 issue / job
  "J-06": [
    {
      id: "ALT-J06-1",
      targetType: "issue",
      targetId: "J-06",
      date: "24 Sep",
      windowLabel: "Move J-06 to W3 · 24 Sep",
      timeWindow: "01:30–03:30",
      feasible: true,
      feasibilityTag: "Feasible",
      fitSummary: "✓ Resource available (REMM access crane returns from POH)",
      expectedTrainImpactMinutes: 28,
      expectedImpactDeltaMinutes: 3,
      trainDelaySummary: "Expected impact: +3 min",
      scheduledDelta: 1,
      deferredDelta: -1,
    },
    {
      id: "ALT-J06-2",
      targetType: "issue",
      targetId: "J-06",
      date: "17 Sep",
      windowLabel: "Reallocate crane from W2 to W1 tonight",
      timeWindow: "02:00–04:00",
      feasible: false,
      feasibilityTag: "Caution",
      infeasibleReason: "⚠ Displaces BCM-03 maintenance prep in W2; affects J-04 ballast cleaning",
      fitSummary: "⚠ Affects J-04 in W2",
      expectedTrainImpactMinutes: 45,
      expectedImpactDeltaMinutes: 20,
      trainDelaySummary: "High operational friction",
      scheduledDelta: 0,
      deferredDelta: 0,
    },
    {
      id: "ALT-J06-3",
      targetType: "issue",
      targetId: "J-06",
      date: "24 Sep",
      windowLabel: "Keep Deferred (Next feasible: 24 Sep)",
      timeWindow: "Deferred",
      feasible: true,
      feasibilityTag: "Feasible",
      fitSummary: "✓ Retains current plan baseline",
      expectedTrainImpactMinutes: 25,
      expectedImpactDeltaMinutes: 0,
      trainDelaySummary: "No change to current schedule",
      scheduledDelta: 0,
      deferredDelta: 0,
    },
  ],
};

// Human-readable plan history (NO prominent r1/r2/r3 labels)
export const HUMAN_PLAN_HISTORY: HumanPlanHistoryItem[] = [
  {
    id: "REV-CURRENT",
    title: "Current Plan Revision",
    date: "17 Sep 2026",
    status: "Pending Approval",
    reason: "Relief-train replanning & USFD weld priority update",
    officer: "Dy. Chief Controller (BCT)",
    technicalRevisionRef: "Rev 3",
  },
  {
    id: "REV-PREV-1",
    title: "Previous Plan Revision",
    date: "14 Sep 2026",
    status: "Superseded",
    reason: "Resource change — shifted W2 start +30 min to clear 12009 Shatabdi path",
    officer: "Dy. Chief Controller (BCT)",
    technicalRevisionRef: "Rev 2",
  },
  {
    id: "REV-PREV-2",
    title: "Previous Plan Revision",
    date: "11 Sep 2026",
    status: "Superseded",
    reason: "Initial generated maintenance plan from CP-SAT solver",
    officer: "System Automation",
    technicalRevisionRef: "Rev 1",
  },
];
