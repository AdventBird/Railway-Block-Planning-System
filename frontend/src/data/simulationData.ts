// ---------------------------------------------------------------------------
// SIMULATION DATA & ENGINE MODEL
// Multi-plan, variable-block, multi-event what-if sandbox logic.
// ---------------------------------------------------------------------------

export type EventTypeKey =
  | "special_train"
  | "reduce_window"
  | "remove_block"
  | "emergency_job"
  | "resource_unavailable"
  | "priority_change";

export interface PlanMeta {
  id: string;
  version: string;
  name: string;
  date: string;
  status: string;
}

export interface SimBlockMeta {
  id: string;
  planId: string;
  label: string;
  corridor: string;
  section: string;
  track: "UP TRACK" | "DOWN TRACK" | "BOTH DIRECTIONS";
  direction: "UP" | "DOWN" | "BOTH";
  startTime: string;
  endTime: string;
  durationHours: string;
  jobsCount: number;
  jobIds: string[];
}

export interface SimJobDetail {
  id: string;
  code: string;
  title: string;
  dept: "Engineering" | "S&T" | "TRD";
  tier: number;
  durationMinutes: number;
  start: string;
  end: string;
}

export const CANONICAL_PLANS: PlanMeta[] = [
  {
    id: "r3",
    version: "Current Plan",
    name: "Current Plan (17 Sep 2026)",
    date: "17 Sep 2026",
    status: "Pending approval",
  },
  {
    id: "r2",
    version: "Plan Revision 2",
    name: "Plan Revision 2 (16 Sep 2026)",
    date: "16 Sep 2026",
    status: "Approved",
  },
  {
    id: "r1",
    version: "Plan Revision 1",
    name: "Plan Revision 1 (15 Sep 2026)",
    date: "15 Sep 2026",
    status: "Historical",
  },
];

export const CANONICAL_SIM_BLOCKS: SimBlockMeta[] = [
  {
    id: "W1",
    planId: "r3",
    label: "W1 · NDLS–GZB · UP",
    corridor: "NDLS–GZB",
    section: "NDLS – GZB",
    track: "UP TRACK",
    direction: "UP",
    startTime: "01:00",
    endTime: "04:00",
    durationHours: "3 h",
    jobsCount: 3,
    jobIds: ["J-02", "J-09", "J-13"],
  },
  {
    id: "W2",
    planId: "r3",
    label: "W2 · TDL–CNB · DOWN",
    corridor: "TDL–CNB",
    section: "TDL – CNB",
    track: "DOWN TRACK",
    direction: "DOWN",
    startTime: "01:30",
    endTime: "05:30",
    durationHours: "4 h",
    jobsCount: 2,
    jobIds: ["J-04", "J-12"],
  },
  {
    id: "W3",
    planId: "r3",
    label: "W3 · PRYJ–DDU · UP",
    corridor: "PRYJ–DDU",
    section: "PRYJ – DDU",
    track: "UP TRACK",
    direction: "UP",
    startTime: "02:00",
    endTime: "05:00",
    durationHours: "3 h",
    jobsCount: 4,
    jobIds: ["J-05", "J-06", "J-07", "J-11"],
  },
  {
    id: "W4",
    planId: "r3",
    label: "W4 · GZB–DDU · UP",
    corridor: "GZB–DDU",
    section: "GZB – DDU",
    track: "UP TRACK",
    direction: "UP",
    startTime: "02:00",
    endTime: "05:30",
    durationHours: "3.5 h",
    jobsCount: 2,
    jobIds: ["J-08", "J-10"],
  },
  {
    id: "W5",
    planId: "r3",
    label: "W5 · DDU–BSB · SINGLE",
    corridor: "DDU–BSB",
    section: "DDU – BSB",
    track: "BOTH DIRECTIONS",
    direction: "BOTH",
    startTime: "02:00",
    endTime: "05:30",
    durationHours: "3.5 h",
    jobsCount: 1,
    jobIds: ["J-01"],
  },
];

export const SIM_JOB_DATABASE: Record<string, SimJobDetail> = {
  "J-01": {
    id: "J-01",
    code: "J-01",
    title: "OHE insulator replacement (shattered)",
    dept: "TRD",
    tier: 0,
    durationMinutes: 120,
    start: "02:00",
    end: "04:00",
  },
  "J-02": {
    id: "J-02",
    code: "J-02",
    title: "Rail fracture weld repair",
    dept: "Engineering",
    tier: 1,
    durationMinutes: 90,
    start: "01:00",
    end: "02:30",
  },
  "J-03": {
    id: "J-03",
    code: "J-03",
    title: "Tundla panel interlocking recovery",
    dept: "S&T",
    tier: 1,
    durationMinutes: 60,
    start: "02:30",
    end: "03:30",
  },
  "J-04": {
    id: "J-04",
    code: "J-04",
    title: "Ballast cleaning (BCM) — deep screening",
    dept: "Engineering",
    tier: 2,
    durationMinutes: 240,
    start: "01:30",
    end: "05:30",
  },
  "J-05": {
    id: "J-05",
    code: "J-05",
    title: "OHE auto-tension adjustment",
    dept: "TRD",
    tier: 2,
    durationMinutes: 90,
    start: "02:00",
    end: "03:30",
  },
  "J-06": {
    id: "J-06",
    code: "J-06",
    title: "Girder bridge bearing inspection",
    dept: "Engineering",
    tier: 3,
    durationMinutes: 120,
    start: "02:30",
    end: "04:30",
  },
  "J-07": {
    id: "J-07",
    code: "J-07",
    title: "Axle counter renewal (EERC)",
    dept: "S&T",
    tier: 3,
    durationMinutes: 120,
    start: "03:00",
    end: "05:00",
  },
  "J-08": {
    id: "J-08",
    code: "J-08",
    title: "Track tamping (TCP)",
    dept: "Engineering",
    tier: 2,
    durationMinutes: 180,
    start: "02:00",
    end: "05:00",
  },
  "J-09": {
    id: "J-09",
    code: "J-09",
    title: "Signal lamp replacement (batch)",
    dept: "S&T",
    tier: 2,
    durationMinutes: 60,
    start: "02:00",
    end: "03:00",
  },
  "J-10": {
    id: "J-10",
    code: "J-10",
    title: "OHE mast pivot lubrication",
    dept: "TRD",
    tier: 4,
    durationMinutes: 90,
    start: "03:30",
    end: "05:00",
  },
  "J-11": {
    id: "J-11",
    code: "J-11",
    title: "Vegetation clearance near mast",
    dept: "Engineering",
    tier: 4,
    durationMinutes: 120,
    start: "02:00",
    end: "04:00",
  },
  "J-12": {
    id: "J-12",
    code: "J-12",
    title: "Cable route inspection & testing",
    dept: "S&T",
    tier: 3,
    durationMinutes: 90,
    start: "02:00",
    end: "03:30",
  },
  "J-13": {
    id: "J-13",
    code: "J-13",
    title: "Motor trolley & packset patrol",
    dept: "Engineering",
    tier: 4,
    durationMinutes: 45,
    start: "03:00",
    end: "03:45",
  },
};

export interface TimelineBarItem {
  id: string;
  label: string;
  start: string;
  end: string;
  type: "job" | "event" | "deferred";
  isDeferred?: boolean;
  note?: string;
}

export interface WhatChangedItem {
  jobId: string;
  title: string;
  badgeText: string;
  badgeTone: "green" | "blue" | "amber" | "red";
  description?: string;
}

export interface AlternativeOption {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  tone: "green" | "blue" | "amber";
  consequence: string;
  impactMinutes: number;
}

export interface SimulationComputationResult {
  headline: string;
  before: {
    planVersion: string;
    blockLabel: string;
    section: string;
    track: string;
    timeRange: string;
    duration: string;
    jobsCount: number;
  };
  event: {
    typeTitle: string;
    corridor: string;
    track: string;
    timeRange: string;
    duration: string;
    detail: string;
  };
  after: {
    planVersion: string;
    blockLabel: string;
    section: string;
    track: string;
    timeRange: string;
    duration: string;
    scheduledCount: number;
    deferredCount: number;
  };
  timelineComparison: {
    ticks: string[];
    startMinute: number;
    endMinute: number;
    beforeBars: TimelineBarItem[];
    afterBars: TimelineBarItem[];
  };
  whatChanged: WhatChangedItem[];
  why: {
    reasonCode: string;
    explanation: string;
    bullets: string[];
  };
  alternatives: AlternativeOption[];
}

export interface SimulationEventParams {
  direction?: string;
  fromTo?: string;
  timeStart?: string;
  timeEnd?: string;
  trainNumber?: string;
  minutesReduction?: number;
  newEndTime?: string;
  emergencyTitle?: string;
  emergencyDuration?: number;
  unavailableResource?: string;
  changedJobId?: string;
  newTier?: number;
  restrictionType?: string;
}

/**
 * Calculates deterministic, rich simulation outcomes for any plan + block + event.
 */
export function calculateSimulationResult(
  planId: string,
  blockId: string,
  eventType: EventTypeKey,
  params: SimulationEventParams
): SimulationComputationResult {
  const plan = CANONICAL_PLANS.find((p) => p.id === planId) || CANONICAL_PLANS[0];
  const block =
    CANONICAL_SIM_BLOCKS.find((b) => b.id === blockId) || CANONICAL_SIM_BLOCKS[0];

  const beforeJobs = block.jobIds.map((id) => SIM_JOB_DATABASE[id] || {
    id,
    code: id,
    title: `Maintenance Job ${id}`,
    dept: "Engineering",
    tier: 2,
    durationMinutes: 60,
    start: block.startTime,
    end: block.endTime,
  });

  // Time scale ticks
  const startH = parseInt(block.startTime.split(":")[0], 10);
  const endH = parseInt(block.endTime.split(":")[0], 10);
  const ticks: string[] = [];
  for (let h = startH; h <= (endH < startH ? endH + 24 : endH); h++) {
    const normH = h % 24;
    const pad = normH < 10 ? `0${normH}` : `${normH}`;
    ticks.push(`${pad}:00`);
    if (h < (endH < startH ? endH + 24 : endH)) {
      ticks.push(`${pad}:30`);
    }
  }

  const startMin = startH * 60 + parseInt(block.startTime.split(":")[1], 10);
  let endMin = endH * 60 + parseInt(block.endTime.split(":")[1], 10);
  if (endMin <= startMin) endMin += 1440;

  // 1. SPECIAL TRAIN
  if (eventType === "special_train") {
    const evStart = params.timeStart || "02:30";
    const evEnd = params.timeEnd || "03:30";
    const evDuration = "1 h";
    const trainNum = params.trainNumber || "00214";

    const beforeBars: TimelineBarItem[] = beforeJobs.map((j) => ({
      id: j.id,
      label: j.id,
      start: j.start,
      end: j.end,
      type: "job",
    }));

    // For after: job 1 moved earlier, job 2 shifted, job 3 deferred if 3 jobs
    const afterBars: TimelineBarItem[] = [];
    const whatChanged: WhatChangedItem[] = [];

    if (beforeJobs.length >= 1) {
      afterBars.push({
        id: beforeJobs[0].id,
        label: `${beforeJobs[0].id} (moved earlier)`,
        start: block.startTime,
        end: evStart,
        type: "job",
      });
      whatChanged.push({
        jobId: beforeJobs[0].id,
        title: beforeJobs[0].title,
        badgeText: "Moved earlier",
        badgeTone: "green",
        description: `Advanced to ${block.startTime}–${evStart} ahead of protected train path`,
      });
    }

    // Special train bar
    afterBars.push({
      id: "EVENT-TRAIN",
      label: `Special train ${trainNum} (${evStart} – ${evEnd})`,
      start: evStart,
      end: evEnd,
      type: "event",
    });

    if (beforeJobs.length >= 2) {
      afterBars.push({
        id: beforeJobs[1].id,
        label: `${beforeJobs[1].id} (shifted)`,
        start: evEnd,
        end: block.endTime,
        type: "job",
      });
      whatChanged.push({
        jobId: beforeJobs[1].id,
        title: beforeJobs[1].title,
        badgeText: "Shifted",
        badgeTone: "blue",
        description: `Shifted to ${evEnd}–${block.endTime} to fit remaining window`,
      });
    }

    if (beforeJobs.length >= 3) {
      afterBars.push({
        id: beforeJobs[2].id,
        label: `${beforeJobs[2].id} (deferred)`,
        start: evEnd,
        end: block.endTime,
        type: "deferred",
        isDeferred: true,
      });
      whatChanged.push({
        jobId: beforeJobs[2].id,
        title: beforeJobs[2].title,
        badgeText: "Deferred",
        badgeTone: "red",
        description: "Insufficient contiguous time in window; deferred to next cycle",
      });
    }

    const scheduledCount = Math.max(1, beforeJobs.length - (beforeJobs.length >= 3 ? 1 : 0));
    const deferredCount = beforeJobs.length >= 3 ? 1 : 0;

    return {
      headline: `Impact of adding a special train (${evStart} – ${evEnd}) to block ${block.id}`,
      before: {
        planVersion: plan.version,
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        jobsCount: beforeJobs.length,
      },
      event: {
        typeTitle: "Special / relief train",
        corridor: block.section,
        track: block.track,
        timeRange: `${evStart} – ${evEnd}`,
        duration: evDuration,
        detail: `Protected movement ${trainNum} Down occupies corridor slot.`,
      },
      after: {
        planVersion: "Simulated plan r4",
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        scheduledCount,
        deferredCount,
      },
      timelineComparison: {
        ticks,
        startMinute: startMin,
        endMinute: endMin,
        beforeBars,
        afterBars,
      },
      whatChanged,
      why: {
        reasonCode: "TRAIN_CONFLICT",
        explanation: `The special train occupies the ${block.track} between ${evStart} – ${evEnd}, overlapping with the scheduled maintenance slot.`,
        bullets: [
          `• ${beforeJobs[0]?.id ?? "First job"} was moved earlier to create a safe, feasible window.`,
          beforeJobs[1] ? `• ${beforeJobs[1].id} was shifted to the remaining available clearance.` : "",
          beforeJobs[2] ? `• ${beforeJobs[2].id} could not be placed due to insufficient window and has been deferred.` : "",
        ].filter(Boolean),
      },
      alternatives: [
        {
          id: "opt-a",
          label: "Option A",
          title: `Move special train to ${block.endTime} edge`,
          subtitle: `All ${beforeJobs.length} jobs can be accommodated safely.`,
          tone: "green",
          consequence: "Preserves full maintenance plan; requires transit path negotiation (+10 min delay).",
          impactMinutes: 10,
        },
        {
          id: "opt-b",
          label: "Option B",
          title: "Use adjacent block (W2 / TDL–CNB)",
          subtitle: `Move deferred work to adjacent division corridor.`,
          tone: "blue",
          consequence: "Maintains maintenance volume with secondary corridor slotting.",
          impactMinutes: 18,
        },
        {
          id: "opt-c",
          label: "Option C",
          title: "Reduce job duration / split passes",
          subtitle: "Execute partial maintenance scope without deferral.",
          tone: "amber",
          consequence: "Requires temporary caution order (TSR 40) until second pass.",
          impactMinutes: 25,
        },
      ],
    };
  }

  // 2. REDUCE BLOCK WINDOW
  if (eventType === "reduce_window") {
    const curStartH = parseInt(block.startTime.split(":")[0], 10);
    const newEnd = params.newEndTime || `${curStartH + 2}:30`;
    const beforeBars: TimelineBarItem[] = beforeJobs.map((j) => ({
      id: j.id,
      label: j.id,
      start: j.start,
      end: j.end,
      type: "job",
    }));

    const afterBars: TimelineBarItem[] = [
      {
        id: beforeJobs[0].id,
        label: `${beforeJobs[0].id} (compressed)`,
        start: block.startTime,
        end: newEnd,
        type: "job",
      },
      {
        id: "EVENT-REDUCTION",
        label: `Window Curtailment (Ends ${newEnd})`,
        start: newEnd,
        end: block.endTime,
        type: "event",
      },
    ];

    if (beforeJobs[1]) {
      afterBars.push({
        id: beforeJobs[1].id,
        label: `${beforeJobs[1].id} (deferred)`,
        start: newEnd,
        end: block.endTime,
        type: "deferred",
        isDeferred: true,
      });
    }

    return {
      headline: `Impact of reducing window on block ${block.id} (Curtailed to ${newEnd})`,
      before: {
        planVersion: plan.version,
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        jobsCount: beforeJobs.length,
      },
      event: {
        typeTitle: "Reduce block window",
        corridor: block.section,
        track: block.track,
        timeRange: `${newEnd} – ${block.endTime}`,
        duration: "-60 min",
        detail: "Trailing freight surge requires early possession hand-back.",
      },
      after: {
        planVersion: "Simulated plan r4",
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${newEnd}`,
        duration: "2 h",
        scheduledCount: 1,
        deferredCount: Math.max(1, beforeJobs.length - 1),
      },
      timelineComparison: {
        ticks,
        startMinute: startMin,
        endMinute: endMin,
        beforeBars,
        afterBars,
      },
      whatChanged: [
        {
          jobId: beforeJobs[0].id,
          title: beforeJobs[0].title,
          badgeText: "Compressed",
          badgeTone: "amber",
          description: `Work scoped to reduced ${block.startTime}–${newEnd} window`,
        },
        ...(beforeJobs.slice(1).map((j) => ({
          jobId: j.id,
          title: j.title,
          badgeText: "Deferred",
          badgeTone: "red" as const,
          description: "Cannot complete inside shortened possession boundary",
        }))),
      ],
      why: {
        reasonCode: "INSUFFICIENT_WINDOW",
        explanation: `Block window was curtailed from ${block.durationHours} to 2 hours to clear freight congestion.`,
        bullets: [
          `• ${beforeJobs[0].id} was truncated to complete within available minutes.`,
          `• Remaining ${beforeJobs.length - 1} work order(s) could not fit safely and have been deferred.`,
        ],
      },
      alternatives: [
        {
          id: "opt-a",
          label: "Option A",
          title: "Run with partial pass & Caution Order",
          subtitle: "Permit trains under temporary speed restriction TSR 40.",
          tone: "green",
          consequence: "Work completed partially; speed normalized after night 2.",
          impactMinutes: 12,
        },
        {
          id: "opt-b",
          label: "Option B",
          title: "Re-roster deferred work to adjacent date",
          subtitle: "Insert into 18 Sep roster with double track gang.",
          tone: "blue",
          consequence: "Maintains full quality standards without split passes.",
          impactMinutes: 18,
        },
      ],
    };
  }

  // 3. REMOVE BLOCK
  if (eventType === "remove_block") {
    const beforeBars: TimelineBarItem[] = beforeJobs.map((j) => ({
      id: j.id,
      label: j.id,
      start: j.start,
      end: j.end,
      type: "job",
    }));

    const afterBars: TimelineBarItem[] = [
      {
        id: "EVENT-WITHDRAWN",
        label: "Block Possession Cancelled / Withdrawn",
        start: block.startTime,
        end: block.endTime,
        type: "event",
      },
    ];

    return {
      headline: `Impact of removing possession on block ${block.id}`,
      before: {
        planVersion: plan.version,
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        jobsCount: beforeJobs.length,
      },
      event: {
        typeTitle: "Remove block window",
        corridor: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        detail: "Signaling / interlocking track-circuit fault revokes possession authority.",
      },
      after: {
        planVersion: "Simulated plan r4",
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: "Cancelled",
        duration: "0 h",
        scheduledCount: 0,
        deferredCount: beforeJobs.length,
      },
      timelineComparison: {
        ticks,
        startMinute: startMin,
        endMinute: endMin,
        beforeBars,
        afterBars,
      },
      whatChanged: beforeJobs.map((j) => ({
        jobId: j.id,
        title: j.title,
        badgeText: "Deferred",
        badgeTone: "red",
        description: "Entire block possession cancelled; job deferred to next planning window",
      })),
      why: {
        reasonCode: "ISOLATION_CONFLICT",
        explanation: "Interlocking failure or operational revocation removes route safety guarantee.",
        bullets: [
          `• All ${beforeJobs.length} work orders in ${block.id} lose authorized track access.`,
          "• Track machine and crew standing orders revoked for this night.",
        ],
      },
      alternatives: [
        {
          id: "opt-a",
          label: "Option A",
          title: "Reschedule to 18 Sep night cycle",
          subtitle: "Re-book entire block with priority dispatch.",
          tone: "green",
          consequence: "No work lost; delayed by 24 hours.",
          impactMinutes: 0,
        },
        {
          id: "opt-b",
          label: "Option B",
          title: "Transfer emergency gangs to adjacent section",
          subtitle: "Deploy crews to unblocked parallel corridors.",
          tone: "blue",
          consequence: "Maximizes gang utilization despite cancellation.",
          impactMinutes: 15,
        },
      ],
    };
  }

  // 4. EMERGENCY JOB
  if (eventType === "emergency_job") {
    const emgTitle = params.emergencyTitle || "EMG-01 · Rail fracture emergency weld";
    const emgDuration = params.emergencyDuration || 90;

    const beforeBars: TimelineBarItem[] = beforeJobs.map((j) => ({
      id: j.id,
      label: j.id,
      start: j.start,
      end: j.end,
      type: "job",
    }));

    const afterBars: TimelineBarItem[] = [
      {
        id: "EMG-01",
        label: `🚨 Tier 0 Emergency (${block.startTime} – 02:30)`,
        start: block.startTime,
        end: "02:30",
        type: "event",
      },
    ];

    if (beforeJobs[0]) {
      afterBars.push({
        id: beforeJobs[0].id,
        label: `${beforeJobs[0].id} (shifted)`,
        start: "02:30",
        end: block.endTime,
        type: "job",
      });
    }

    return {
      headline: `Impact of inserting Tier 0 Emergency into block ${block.id}`,
      before: {
        planVersion: plan.version,
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        jobsCount: beforeJobs.length,
      },
      event: {
        typeTitle: "Emergency job insertion",
        corridor: block.section,
        track: block.track,
        timeRange: `${block.startTime} – 02:30`,
        duration: `${emgDuration} min`,
        detail: `Tier 0 urgent intervention: ${emgTitle}`,
      },
      after: {
        planVersion: "Simulated plan r4",
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        scheduledCount: 1,
        deferredCount: Math.max(0, beforeJobs.length - 1),
      },
      timelineComparison: {
        ticks,
        startMinute: startMin,
        endMinute: endMin,
        beforeBars,
        afterBars,
      },
      whatChanged: [
        {
          jobId: "EMG-01",
          title: emgTitle,
          badgeText: "Newly Scheduled",
          badgeTone: "green",
          description: "Priority Tier 0 preempts regular scheduled maintenance",
        },
        ...(beforeJobs.slice(1).map((j) => ({
          jobId: j.id,
          title: j.title,
          badgeText: "Displaced / Deferred",
          badgeTone: "red" as const,
          description: "Displaced by emergency intervention slot",
        }))),
      ],
      why: {
        reasonCode: "LOWER_PRIORITY",
        explanation: "Tier 0 safety-critical failure overrides routine maintenance hierarchy.",
        bullets: [
          "• Emergency repair takes immediate precedence in the first possession slot.",
          `• Routine lower-tier work orders displaced to prevent safety violations.`,
        ],
      },
      alternatives: [
        {
          id: "opt-a",
          label: "Option A",
          title: "Reroute displaced work to W2 adjacent corridor",
          subtitle: "Avoid complete deferral by utilizing nearby machinery.",
          tone: "green",
          consequence: "Preserves maintenance completion rate.",
          impactMinutes: 15,
        },
      ],
    };
  }

  // 5. RESOURCE UNAVAILABLE
  if (eventType === "resource_unavailable") {
    const resName = params.unavailableResource || "Tower Wagon RU-04";

    return {
      headline: `Impact of ${resName} breakdown in block ${block.id}`,
      before: {
        planVersion: plan.version,
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        jobsCount: beforeJobs.length,
      },
      event: {
        typeTitle: "Resource unavailable",
        corridor: block.section,
        track: block.track,
        timeRange: "02:00 – 05:00",
        duration: "3 h",
        detail: `Critical equipment breakdown: ${resName} mechanically unavailable.`,
      },
      after: {
        planVersion: "Simulated plan r4",
        blockLabel: block.label,
        section: block.section,
        track: block.track,
        timeRange: `${block.startTime} – ${block.endTime}`,
        duration: block.durationHours,
        scheduledCount: Math.max(1, beforeJobs.length - 1),
        deferredCount: 1,
      },
      timelineComparison: {
        ticks,
        startMinute: startMin,
        endMinute: endMin,
        beforeBars: beforeJobs.map((j) => ({
          id: j.id,
          label: j.id,
          start: j.start,
          end: j.end,
          type: "job",
        })),
        afterBars: [
          {
            id: beforeJobs[0].id,
            label: `${beforeJobs[0].id} (active)`,
            start: block.startTime,
            end: "02:30",
            type: "job",
          },
          {
            id: "EVENT-RES",
            label: `Resource Outage (${resName})`,
            start: "02:00",
            end: block.endTime,
            type: "event",
          },
        ],
      },
      whatChanged: [
        {
          jobId: beforeJobs[beforeJobs.length - 1].id,
          title: beforeJobs[beforeJobs.length - 1].title,
          badgeText: "Deferred",
          badgeTone: "red",
          description: `Requires ${resName} which is out of service`,
        },
      ],
      why: {
        reasonCode: "RESOURCE_CONFLICT",
        explanation: `${resName} failed pre-departure inspection and cannot enter the section.`,
        bullets: [
          `• Dependent electrical/catenary work orders cannot proceed without certified machinery.`,
          `• Machine crew safely held at base depot.`,
        ],
      },
      alternatives: [
        {
          id: "opt-a",
          label: "Option A",
          title: "Mobilize standby equipment from Ghaziabad depot",
          subtitle: "Deploy reserve Tower Wagon TW-925 (+45 min transit).",
          tone: "green",
          consequence: "Allows job to proceed with slight delayed start.",
          impactMinutes: 20,
        },
      ],
    };
  }

  // 6. PRIORITY CHANGE (DEFAULT FALLBACK)
  return {
    headline: `Impact of priority change in block ${block.id}`,
    before: {
      planVersion: plan.version,
      blockLabel: block.label,
      section: block.section,
      track: block.track,
      timeRange: `${block.startTime} – ${block.endTime}`,
      duration: block.durationHours,
      jobsCount: beforeJobs.length,
    },
    event: {
      typeTitle: "Priority escalation",
      corridor: block.section,
      track: block.track,
      timeRange: block.startTime,
      duration: "Immediate",
      detail: "Work order escalated to Tier 1 by safety inspection mandate.",
    },
    after: {
      planVersion: "Simulated plan r4",
      blockLabel: block.label,
      section: block.section,
      track: block.track,
      timeRange: `${block.startTime} – ${block.endTime}`,
      duration: block.durationHours,
      scheduledCount: beforeJobs.length,
      deferredCount: 0,
    },
    timelineComparison: {
      ticks,
      startMinute: startMin,
      endMinute: endMin,
      beforeBars: beforeJobs.map((j) => ({
        id: j.id,
        label: j.id,
        start: j.start,
        end: j.end,
        type: "job",
      })),
      afterBars: beforeJobs.map((j) => ({
        id: j.id,
        label: `${j.id} (locked priority)`,
        start: j.start,
        end: j.end,
        type: "job",
      })),
    },
    whatChanged: [
      {
        jobId: beforeJobs[0].id,
        title: beforeJobs[0].title,
        badgeText: "Priority Escalated",
        badgeTone: "green",
        description: "Locked into early schedule slot with guaranteed possession",
      },
    ],
    why: {
      reasonCode: "PRIORITY_OVERRIDE",
      explanation: "Safety officer escalation promotes job ahead of general maintenance queue.",
      bullets: [
        "• Protected against displacement by subsequent traffic adjustments.",
      ],
    },
    alternatives: [
      {
        id: "opt-a",
        label: "Option A",
        title: "Maintain elevated priority throughout planning cycle",
        subtitle: "No secondary adjustments required.",
        tone: "green",
        consequence: "Job is locked in all forward horizon plans.",
        impactMinutes: 0,
      },
    ],
  };
}
