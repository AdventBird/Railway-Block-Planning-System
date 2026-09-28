// ---------------------------------------------------------------------------
// 30-Day Planning Horizon Dataset (September 2026)
// Provides structured, consistent multi-day maintenance planning data
// answering: WHAT, WHEN, WHERE, WHICH TRACK, WHAT BLOCK, CONSTRAINTS & ALTERNATIVES.
// ---------------------------------------------------------------------------

export type JobStatus = "scheduled" | "deferred" | "at_risk" | "carry_forward";
export type TrackDirection = "UP" | "DOWN" | "SINGLE";

export interface HorizonJob {
  id: string;
  title: string;
  dept: "Engineering" | "S&T" | "TRD";
  tier: 0 | 1 | 2 | 3 | 4;
  plannedDate: string | null; // e.g. "2026-09-17" or null
  blockId: string | null;      // e.g. "W1" or null
  sectionId: string;
  sectionName: string;
  track: TrackDirection;
  startTime?: string;
  endTime?: string;
  minutes: number;
  deadline: string;
  status: JobStatus;
  reason?: string;
  nextFeasibleDate?: string;
  nextFeasibleWindow?: string;
  resources: string[];
  parallel?: boolean;
}

export interface HorizonDay {
  date: string;          // "2026-09-17"
  dayNum: number;        // 17
  dayName: string;       // "Thu"
  monthName: string;     // "September"
  jobsCount: number;
  blocksCount: number;
  utilization: number;   // percentage
  trainImpactMinutes: number;
  hasCritical: boolean;
  hasDeadlineRisk: boolean;
  isHighWorkload: boolean;
}

export interface CorridorTrackSection {
  id: string;
  fromStation: string;
  toStation: string;
  name: string;
  distanceKm: number;
  lineType: "DOUBLE" | "SINGLE";
  tracks: {
    id: string;
    direction: TrackDirection;
    label: string;
    description: string;
  }[];
}

export interface FutureTrainMovement {
  id: string;
  number: string;
  name: string;
  type: "passenger" | "freight" | "special";
  sectionId: string;
  track: TrackDirection;
  start: string; // HH:MM
  end: string;   // HH:MM
  note?: string;
  protectPath?: boolean;
}

export interface FutureBlockWindow {
  id: string;
  sectionId: string;
  track: TrackDirection;
  start: string; // HH:MM
  end: string;   // HH:MM
  minutes: number;
  status: "recommended" | "pending" | "approved" | "rejected";
  blockType: string;
  jobIds: string[];
  trainImpactMin: number;
  impactSummary: string;
  unusedCapacityMin: number;
  candidateJobIds: string[];
  whySummary: string[];
  feasibilityChecks: {
    label: string;
    satisfied: boolean;
  }[];
}

export interface FeasibleAlternativeWindow {
  windowId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  isFeasible: boolean;
  trainConflict: boolean;
  resourcesAvailable: boolean;
  compatibleWork: boolean;
  trainImpactDeltaMin: number;
  utilizationDeltaPct: number;
  note: string;
}

// ---------------------------------------------------------------------------
// 38 Jobs Across September 2026 Horizon
// 28 Scheduled · 6 Deferred · 3 At Risk · 1 Carry-Forward
// ---------------------------------------------------------------------------

export const HORIZON_JOBS: HorizonJob[] = [
  {
    id: "J-01",
    title: "Rail panel replacement & flash butt weld",
    dept: "Engineering",
    tier: 1,
    plannedDate: "2026-09-14",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:00",
    endTime: "03:45",
    minutes: 105,
    deadline: "16 Sep",
    status: "scheduled",
    resources: ["Mobile flash butt plant", "P-Way team 1"],
  },
  {
    id: "J-02",
    title: "Rail fracture weld repair",
    dept: "Engineering",
    tier: 1,
    plannedDate: "2026-09-17",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:05",
    endTime: "03:15",
    minutes: 70,
    deadline: "18 Sep",
    status: "scheduled",
    resources: ["REMM-2 welding set", "P-Way welding party"],
    parallel: false,
  },
  {
    id: "J-03",
    title: "Tundla panel interlocking failure recovery",
    dept: "S&T",
    tier: 1,
    plannedDate: "2026-09-17",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "01:30",
    endTime: "02:30",
    minutes: 60,
    deadline: "Immediate",
    status: "scheduled",
    resources: ["S&T failure team", "Spare EI cards"],
    parallel: false,
  },
  {
    id: "J-04",
    title: "Ballast cleaning (BCM) — deep screening",
    dept: "Engineering",
    tier: 2,
    plannedDate: "2026-09-21",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "01:30",
    endTime: "05:30",
    minutes: 240,
    deadline: "22 Sep",
    status: "scheduled",
    resources: ["BCM-03", "Ballast regulator", "BRNA rake"],
  },
  {
    id: "J-05",
    title: "OHE auto-tension adjustment",
    dept: "TRD",
    tier: 2,
    plannedDate: null,
    blockId: null,
    sectionId: "SEC-ALD-CNB",
    sectionName: "ALD–CNB",
    track: "UP",
    minutes: 90,
    deadline: "18 Sep",
    status: "at_risk",
    reason: "Train conflict with Down Rajdhani & freight corridor paths",
    nextFeasibleDate: "2026-09-23",
    nextFeasibleWindow: "W2 (23 Sep · 04:10–05:30)",
    resources: ["Tower wagon TW-925", "OHE crew B"],
  },
  {
    id: "J-06",
    title: "Girder bearing inspection & greasing",
    dept: "Engineering",
    tier: 3,
    plannedDate: "2026-09-24",
    blockId: "W2",
    sectionId: "SEC-ALD-CNB",
    sectionName: "ALD–CNB",
    track: "DOWN",
    startTime: "02:00",
    endTime: "04:00",
    minutes: 120,
    deadline: "30 Sep",
    status: "scheduled",
    resources: ["REMM access crane", "Bridge inspection party"],
  },
  {
    id: "J-07",
    title: "Axle counter renewal (EERC)",
    dept: "S&T",
    tier: 3,
    plannedDate: "2026-09-17",
    blockId: "W3",
    sectionId: "SEC-ALD-CNB",
    sectionName: "ALD–CNB",
    track: "UP",
    startTime: "03:15",
    endTime: "06:00",
    minutes: 165,
    deadline: "22 Sep",
    status: "scheduled",
    resources: ["S&T EERC team", "Spinner tester"],
  },
  {
    id: "J-08",
    title: "Track tamping (TCP) — post-grinding",
    dept: "Engineering",
    tier: 3,
    plannedDate: "2026-09-23",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "01:30",
    endTime: "05:00",
    minutes: 210,
    deadline: "25 Sep",
    status: "scheduled",
    resources: ["TCP tamping machine", "Track geometry car"],
  },
  {
    id: "J-09",
    title: "Signal lamp replacement — batch",
    dept: "S&T",
    tier: 4,
    plannedDate: "2026-09-17",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "03:00",
    endTime: "04:00",
    minutes: 60,
    deadline: "30 Sep",
    status: "scheduled",
    resources: ["S&T lamp party"],
    parallel: true,
  },
  {
    id: "J-10",
    title: "OHE mast pivot lubrication",
    dept: "TRD",
    tier: 4,
    plannedDate: null,
    blockId: null,
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    minutes: 90,
    deadline: "05 Oct",
    status: "deferred",
    reason: "Higher-priority work — Tier 1 weld repair consumes slot safely",
    nextFeasibleDate: "2026-09-24",
    nextFeasibleWindow: "W1 (24 Sep · 02:30–04:00)",
    resources: ["OHE line party"],
  },
  {
    id: "J-11",
    title: "Vegetation clearance — rock cuttings",
    dept: "Engineering",
    tier: 4,
    plannedDate: null,
    blockId: null,
    sectionId: "SEC-ALD-CNB",
    sectionName: "ALD–CNB",
    track: "DOWN",
    minutes: 120,
    deadline: "21 Sep",
    status: "deferred",
    reason: "Insufficient window — requires daylight traffic gap for cutting slope access",
    nextFeasibleDate: "2026-09-20",
    nextFeasibleWindow: "Sunday mega-block (20 Sep · 10:00–12:30)",
    resources: ["VGR party", "Chainsaw kit"],
  },
  {
    id: "J-12",
    title: "Cable route inspection & marking",
    dept: "S&T",
    tier: 4,
    plannedDate: null,
    blockId: null,
    sectionId: "SEC-CNB-PRYJ",
    sectionName: "CNB–PRYJ",
    track: "DOWN",
    minutes: 90,
    deadline: "23 Sep",
    status: "deferred",
    reason: "Train conflict — 02612 VIP special occupies safe clearing zone",
    nextFeasibleDate: "2026-09-25",
    nextFeasibleWindow: "W2 (25 Sep · 02:00–03:30)",
    resources: ["S&T cable party"],
  },
  {
    id: "J-13",
    title: "Motor trolley & packset patrol",
    dept: "Engineering",
    tier: 4,
    plannedDate: "2026-09-17",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "03:15",
    endTime: "03:45",
    minutes: 30,
    deadline: "19 Sep",
    status: "scheduled",
    resources: ["Motor trolley T-12", "Patrol team"],
    parallel: true,
  },
  {
    id: "J-14",
    title: "Track renewal & destressing pass",
    dept: "Engineering",
    tier: 1,
    plannedDate: "2026-09-15",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "01:00",
    endTime: "04:30",
    minutes: 210,
    deadline: "17 Sep",
    status: "scheduled",
    resources: ["Track renewal train", "Welding crew"],
  },
  {
    id: "J-15",
    title: "Point machine 104A/B overhaul",
    dept: "S&T",
    tier: 2,
    plannedDate: "2026-09-16",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:00",
    endTime: "03:30",
    minutes: 90,
    deadline: "18 Sep",
    status: "scheduled",
    resources: ["Point technician squad", "Megger kit"],
  },
  {
    id: "J-16",
    title: "Catenary height & stagger alignment",
    dept: "TRD",
    tier: 3,
    plannedDate: "2026-09-16",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "02:30",
    endTime: "04:30",
    minutes: 120,
    deadline: "20 Sep",
    status: "scheduled",
    resources: ["Tower wagon TW-925", "OHE crew A"],
  },
  {
    id: "J-17",
    title: "Track renewal (high-cant curve)",
    dept: "Engineering",
    tier: 1,
    plannedDate: null,
    blockId: null,
    sectionId: "SEC-CNB-PRYJ",
    sectionName: "CNB–PRYJ",
    track: "UP",
    minutes: 180,
    deadline: "18 Sep",
    status: "at_risk",
    reason: "No feasible safe slot before deadline — protected VIP special blocks window",
    nextFeasibleDate: "2026-09-26",
    nextFeasibleWindow: "W1 (26 Sep · 01:00–04:00)",
    resources: ["P-Way curve team", "Cant gauge car"],
  },
  {
    id: "J-18",
    title: "Flash butt welding in situ",
    dept: "Engineering",
    tier: 2,
    plannedDate: "2026-09-15",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:15",
    endTime: "04:00",
    minutes: 105,
    deadline: "19 Sep",
    status: "scheduled",
    resources: ["Mobile FBW unit"],
  },
  {
    id: "J-19",
    title: "Track circuit bonding overhaul",
    dept: "S&T",
    tier: 3,
    plannedDate: "2026-09-15",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:30",
    endTime: "03:45",
    minutes: 75,
    deadline: "21 Sep",
    status: "scheduled",
    resources: ["S&T bond party"],
    parallel: true,
  },
  {
    id: "J-20",
    title: "Neutral section insulator inspection",
    dept: "TRD",
    tier: 2,
    plannedDate: "2026-09-18",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "01:30",
    endTime: "03:00",
    minutes: 90,
    deadline: "20 Sep",
    status: "scheduled",
    resources: ["Tower wagon TW-925"],
  },
  {
    id: "J-21",
    title: "Culvert structural inspection",
    dept: "Engineering",
    tier: 3,
    plannedDate: "2026-09-18",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "02:00",
    endTime: "03:30",
    minutes: 90,
    deadline: "24 Sep",
    status: "scheduled",
    resources: ["Bridge team 2"],
  },
  {
    id: "J-22",
    title: "Electronic Interlocking logic card replacement",
    dept: "S&T",
    tier: 1,
    plannedDate: null,
    blockId: null,
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    minutes: 60,
    deadline: "19 Sep",
    status: "at_risk",
    reason: "Resource conflict — testing engineer rostered at Tundla until 21 Sep",
    nextFeasibleDate: "2026-09-22",
    nextFeasibleWindow: "W2 (22 Sep · 02:00–03:00)",
    resources: ["Certified S&T engineer"],
  },
  {
    id: "J-23",
    title: "Turnout renewal 1 in 12 (points 201A)",
    dept: "Engineering",
    tier: 2,
    plannedDate: "2026-09-21",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "01:15",
    endTime: "04:30",
    minutes: 195,
    deadline: "23 Sep",
    status: "scheduled",
    resources: ["Turnout gang", "Crane 10T"],
  },
  {
    id: "J-24",
    title: "Dropper and jumper renewal",
    dept: "TRD",
    tier: 3,
    plannedDate: "2026-09-22",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:00",
    endTime: "04:00",
    minutes: 120,
    deadline: "26 Sep",
    status: "scheduled",
    resources: ["OHE line squad"],
  },
  {
    id: "J-25",
    title: "Track recording car run (TRC-8)",
    dept: "Engineering",
    tier: 2,
    plannedDate: "2026-09-22",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "01:45",
    endTime: "03:45",
    minutes: 120,
    deadline: "25 Sep",
    status: "scheduled",
    resources: ["TRC coach 8"],
  },
  {
    id: "J-26",
    title: "Digital axle counter software health audit",
    dept: "S&T",
    tier: 4,
    plannedDate: "2026-09-23",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "02:30",
    endTime: "04:00",
    minutes: 90,
    deadline: "28 Sep",
    status: "scheduled",
    resources: ["S&T test laptop"],
  },
  {
    id: "J-27",
    title: "Traction sub-station transformer oil test",
    dept: "TRD",
    tier: 3,
    plannedDate: "2026-09-23",
    blockId: "W3",
    sectionId: "SEC-ALD-CNB",
    sectionName: "ALD–CNB",
    track: "UP",
    startTime: "01:30",
    endTime: "03:30",
    minutes: 120,
    deadline: "29 Sep",
    status: "scheduled",
    resources: ["TSS test set"],
  },
  {
    id: "J-28",
    title: "Glued insulated rail joint replacement",
    dept: "Engineering",
    tier: 2,
    plannedDate: "2026-09-24",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:00",
    endTime: "03:30",
    minutes: 90,
    deadline: "27 Sep",
    status: "scheduled",
    resources: ["Thermit weld party"],
  },
  {
    id: "J-29",
    title: "Signal cable insulation meggering",
    dept: "S&T",
    tier: 3,
    plannedDate: "2026-09-24",
    blockId: "W3",
    sectionId: "SEC-ALD-CNB",
    sectionName: "ALD–CNB",
    track: "UP",
    startTime: "02:00",
    endTime: "04:30",
    minutes: 150,
    deadline: "30 Sep",
    status: "scheduled",
    resources: ["Megger crew"],
  },
  {
    id: "J-30",
    title: "OHE contact wire wear audit",
    dept: "TRD",
    tier: 4,
    plannedDate: "2026-09-25",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:30",
    endTime: "04:00",
    minutes: 90,
    deadline: "05 Oct",
    status: "scheduled",
    resources: ["Wire gauge crew"],
  },
  {
    id: "J-31",
    title: "Yard signaling interlocking overhaul",
    dept: "S&T",
    tier: 2,
    plannedDate: null,
    blockId: null,
    sectionId: "SEC-CNB-PRYJ",
    sectionName: "CNB–PRYJ",
    track: "DOWN",
    minutes: 240,
    deadline: "28 Sep",
    status: "carry_forward",
    reason: "No feasible slot in September horizon — requires 4h mega possession",
    nextFeasibleDate: "2026-10-04",
    nextFeasibleWindow: "Candidate October possession (04 Oct · 01:00–05:00)",
    resources: ["Yard overhaul team"],
  },
  {
    id: "J-32",
    title: "Ultrasonic rail flaw testing (USFD-9)",
    dept: "Engineering",
    tier: 1,
    plannedDate: "2026-09-25",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "01:30",
    endTime: "04:00",
    minutes: 150,
    deadline: "27 Sep",
    status: "scheduled",
    resources: ["USFD double-rail tester"],
  },
  {
    id: "J-33",
    title: "Isolator blade alignment and earthing test",
    dept: "TRD",
    tier: 3,
    plannedDate: "2026-09-25",
    blockId: "W3",
    sectionId: "SEC-ALD-CNB",
    sectionName: "ALD–CNB",
    track: "UP",
    startTime: "02:00",
    endTime: "03:30",
    minutes: 90,
    deadline: "02 Oct",
    status: "scheduled",
    resources: ["TRD linesmen"],
  },
  {
    id: "J-34",
    title: "Switch expansion joint (SEJ) adjustment",
    dept: "Engineering",
    tier: 2,
    plannedDate: "2026-09-26",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:00",
    endTime: "03:45",
    minutes: 105,
    deadline: "29 Sep",
    status: "scheduled",
    resources: ["SEJ repair party"],
  },
  {
    id: "J-35",
    title: "Substation earthing resistance audit",
    dept: "TRD",
    tier: 3,
    plannedDate: "2026-09-26",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "02:30",
    endTime: "04:30",
    minutes: 120,
    deadline: "03 Oct",
    status: "scheduled",
    resources: ["Earth tester squad"],
  },
  {
    id: "J-36",
    title: "Point detection circuit overhaul",
    dept: "S&T",
    tier: 2,
    plannedDate: "2026-09-28",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "01:45",
    endTime: "03:30",
    minutes: 105,
    deadline: "30 Sep",
    status: "scheduled",
    resources: ["Point machine party"],
  },
  {
    id: "J-37",
    title: "Deep ballast tamping KM 45–52",
    dept: "Engineering",
    tier: 2,
    plannedDate: "2026-09-28",
    blockId: "W2",
    sectionId: "SEC-GZB-ALD",
    sectionName: "GZB–ALD",
    track: "DOWN",
    startTime: "01:30",
    endTime: "05:00",
    minutes: 210,
    deadline: "02 Oct",
    status: "scheduled",
    resources: ["CSM-911 tamping machine"],
  },
  {
    id: "J-38",
    title: "Level crossing gate interlocking testing",
    dept: "S&T",
    tier: 3,
    plannedDate: "2026-09-29",
    blockId: "W1",
    sectionId: "SEC-NDLS-GZB",
    sectionName: "NDLS–GZB",
    track: "UP",
    startTime: "02:00",
    endTime: "03:30",
    minutes: 90,
    deadline: "04 Oct",
    status: "scheduled",
    resources: ["LC gate inspection team"],
  },
];

// ---------------------------------------------------------------------------
// Calendar Days for September 2026 (1 to 30)
// ---------------------------------------------------------------------------

export const SEPTEMBER_CALENDAR: HorizonDay[] = [
  { date: "2026-09-01", dayNum: 1, dayName: "Tue", monthName: "September", jobsCount: 3, blocksCount: 1, utilization: 55, trainImpactMinutes: 10, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-02", dayNum: 2, dayName: "Wed", monthName: "September", jobsCount: 2, blocksCount: 1, utilization: 48, trainImpactMinutes: 5, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-03", dayNum: 3, dayName: "Thu", monthName: "September", jobsCount: 3, blocksCount: 2, utilization: 62, trainImpactMinutes: 15, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-04", dayNum: 4, dayName: "Fri", monthName: "September", jobsCount: 3, blocksCount: 1, utilization: 50, trainImpactMinutes: 8, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-05", dayNum: 5, dayName: "Sat", monthName: "September", jobsCount: 1, blocksCount: 1, utilization: 35, trainImpactMinutes: 0, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-06", dayNum: 6, dayName: "Sun", monthName: "September", jobsCount: 0, blocksCount: 0, utilization: 0, trainImpactMinutes: 0, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-07", dayNum: 7, dayName: "Mon", monthName: "September", jobsCount: 5, blocksCount: 2, utilization: 72, trainImpactMinutes: 20, hasCritical: true, hasDeadlineRisk: false, isHighWorkload: true },
  { date: "2026-09-08", dayNum: 8, dayName: "Tue", monthName: "September", jobsCount: 4, blocksCount: 2, utilization: 64, trainImpactMinutes: 12, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-09", dayNum: 9, dayName: "Wed", monthName: "September", jobsCount: 6, blocksCount: 3, utilization: 78, trainImpactMinutes: 22, hasCritical: true, hasDeadlineRisk: false, isHighWorkload: true },
  { date: "2026-09-10", dayNum: 10, dayName: "Thu", monthName: "September", jobsCount: 5, blocksCount: 2, utilization: 70, trainImpactMinutes: 18, hasCritical: false, hasDeadlineRisk: true, isHighWorkload: true },
  { date: "2026-09-11", dayNum: 11, dayName: "Fri", monthName: "September", jobsCount: 7, blocksCount: 3, utilization: 84, trainImpactMinutes: 25, hasCritical: true, hasDeadlineRisk: false, isHighWorkload: true },
  { date: "2026-09-12", dayNum: 12, dayName: "Sat", monthName: "September", jobsCount: 2, blocksCount: 1, utilization: 40, trainImpactMinutes: 5, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-13", dayNum: 13, dayName: "Sun", monthName: "September", jobsCount: 1, blocksCount: 1, utilization: 30, trainImpactMinutes: 0, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-14", dayNum: 14, dayName: "Mon", monthName: "September", jobsCount: 3, blocksCount: 1, utilization: 58, trainImpactMinutes: 10, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-15", dayNum: 15, dayName: "Tue", monthName: "September", jobsCount: 5, blocksCount: 2, utilization: 71, trainImpactMinutes: 15, hasCritical: true, hasDeadlineRisk: false, isHighWorkload: true },
  { date: "2026-09-16", dayNum: 16, dayName: "Wed", monthName: "September", jobsCount: 4, blocksCount: 2, utilization: 68, trainImpactMinutes: 12, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-17", dayNum: 17, dayName: "Thu", monthName: "September", jobsCount: 7, blocksCount: 3, utilization: 82, trainImpactMinutes: 25, hasCritical: true, hasDeadlineRisk: false, isHighWorkload: true },
  { date: "2026-09-18", dayNum: 18, dayName: "Fri", monthName: "September", jobsCount: 2, blocksCount: 2, utilization: 60, trainImpactMinutes: 10, hasCritical: false, hasDeadlineRisk: true, isHighWorkload: false },
  { date: "2026-09-19", dayNum: 19, dayName: "Sat", monthName: "September", jobsCount: 1, blocksCount: 1, utilization: 32, trainImpactMinutes: 0, hasCritical: false, hasDeadlineRisk: true, isHighWorkload: false },
  { date: "2026-09-20", dayNum: 20, dayName: "Sun", monthName: "September", jobsCount: 0, blocksCount: 0, utilization: 0, trainImpactMinutes: 0, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-21", dayNum: 21, dayName: "Mon", monthName: "September", jobsCount: 4, blocksCount: 2, utilization: 65, trainImpactMinutes: 15, hasCritical: false, hasDeadlineRisk: true, isHighWorkload: false },
  { date: "2026-09-22", dayNum: 22, dayName: "Tue", monthName: "September", jobsCount: 3, blocksCount: 2, utilization: 59, trainImpactMinutes: 8, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-23", dayNum: 23, dayName: "Wed", monthName: "September", jobsCount: 6, blocksCount: 3, utilization: 80, trainImpactMinutes: 24, hasCritical: true, hasDeadlineRisk: true, isHighWorkload: true },
  { date: "2026-09-24", dayNum: 24, dayName: "Thu", monthName: "September", jobsCount: 5, blocksCount: 2, utilization: 72, trainImpactMinutes: 16, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: true },
  { date: "2026-09-25", dayNum: 25, dayName: "Fri", monthName: "September", jobsCount: 4, blocksCount: 2, utilization: 66, trainImpactMinutes: 14, hasCritical: true, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-26", dayNum: 26, dayName: "Sat", monthName: "September", jobsCount: 2, blocksCount: 1, utilization: 45, trainImpactMinutes: 6, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-27", dayNum: 27, dayName: "Sun", monthName: "September", jobsCount: 1, blocksCount: 1, utilization: 25, trainImpactMinutes: 0, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-28", dayNum: 28, dayName: "Mon", monthName: "September", jobsCount: 3, blocksCount: 2, utilization: 61, trainImpactMinutes: 12, hasCritical: false, hasDeadlineRisk: true, isHighWorkload: false },
  { date: "2026-09-29", dayNum: 29, dayName: "Tue", monthName: "September", jobsCount: 2, blocksCount: 1, utilization: 44, trainImpactMinutes: 4, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
  { date: "2026-09-30", dayNum: 30, dayName: "Wed", monthName: "September", jobsCount: 1, blocksCount: 1, utilization: 38, trainImpactMinutes: 0, hasCritical: false, hasDeadlineRisk: false, isHighWorkload: false },
];

// ---------------------------------------------------------------------------
// Route & Corridor Sections Topology
// ---------------------------------------------------------------------------

export const DEFAULT_CORRIDOR_PATH = ["NDLS", "GZB", "ALD", "CNB", "PRYJ"];

export const ALL_NETWORK_STATIONS = [
  { code: "NDLS", name: "New Delhi" },
  { code: "GZB", name: "Ghaziabad" },
  { code: "ALJN", name: "Aligarh Junction" },
  { code: "TDL", name: "Tundla Junction" },
  { code: "ALD", name: "Aligarh/Tundla Corridor" },
  { code: "CNB", name: "Kanpur Central" },
  { code: "FTP", name: "Fatehpur" },
  { code: "PRYJ", name: "Prayagraj Junction" },
  { code: "DDU", name: "Pt. Deen Dayal Upadhyaya" },
  { code: "BSB", name: "Varanasi Junction" },
];

export const CORRIDOR_SECTIONS: CorridorTrackSection[] = [
  {
    id: "SEC-NDLS-GZB",
    fromStation: "NDLS",
    toStation: "GZB",
    name: "NDLS – GZB",
    distanceKm: 17,
    lineType: "DOUBLE",
    tracks: [
      { id: "TRK-NDLS-GZB-UP", direction: "UP", label: "UP →", description: "Direction: NDLS → GZB" },
      { id: "TRK-NDLS-GZB-DN", direction: "DOWN", label: "DOWN ←", description: "Direction: GZB → NDLS" },
    ],
  },
  {
    id: "SEC-GZB-ALD",
    fromStation: "GZB",
    toStation: "ALD",
    name: "GZB – ALD",
    distanceKm: 61,
    lineType: "DOUBLE",
    tracks: [
      { id: "TRK-GZB-ALD-UP", direction: "UP", label: "UP →", description: "Direction: GZB → ALD" },
      { id: "TRK-GZB-ALD-DN", direction: "DOWN", label: "DOWN ←", description: "Direction: ALD → GZB" },
    ],
  },
  {
    id: "SEC-ALD-CNB",
    fromStation: "ALD",
    toStation: "CNB",
    name: "ALD – CNB",
    distanceKm: 136,
    lineType: "DOUBLE",
    tracks: [
      { id: "TRK-ALD-CNB-UP", direction: "UP", label: "UP →", description: "Direction: ALD → CNB" },
      { id: "TRK-ALD-CNB-DN", direction: "DOWN", label: "DOWN ←", description: "Direction: CNB → ALD" },
    ],
  },
  {
    id: "SEC-CNB-PRYJ",
    fromStation: "CNB",
    toStation: "PRYJ",
    name: "CNB – PRYJ",
    distanceKm: 170,
    lineType: "DOUBLE",
    tracks: [
      { id: "TRK-CNB-PRYJ-UP", direction: "UP", label: "UP →", description: "Direction: CNB → PRYJ" },
      { id: "TRK-CNB-PRYJ-DN", direction: "DOWN", label: "DOWN ←", description: "Direction: PRYJ → CNB" },
    ],
  },
  {
    id: "SEC-DDU-BSB",
    fromStation: "DDU",
    toStation: "BSB",
    name: "DDU – BSB",
    distanceKm: 18,
    lineType: "SINGLE",
    tracks: [
      { id: "TRK-DDU-BSB-SINGLE", direction: "SINGLE", label: "SINGLE ↕", description: "Single track · Both directions affected" },
    ],
  },
];

// Derive active sections from station path
export function deriveSectionsFromPath(stationCodes: string[]): CorridorTrackSection[] {
  const result: CorridorTrackSection[] = [];
  for (let i = 0; i < stationCodes.length - 1; i++) {
    const from = stationCodes[i];
    const to = stationCodes[i + 1];
    const found = CORRIDOR_SECTIONS.find(
      (s) =>
        (s.fromStation === from && s.toStation === to) ||
        (s.fromStation === to && s.toStation === from)
    );
    if (found) {
      result.push(found);
    } else {
      // Dynamic fallback section
      result.push({
        id: `SEC-${from}-${to}`,
        fromStation: from,
        toStation: to,
        name: `${from} – ${to}`,
        distanceKm: 45,
        lineType: "DOUBLE",
        tracks: [
          { id: `TRK-${from}-${to}-UP`, direction: "UP", label: "UP →", description: `Direction: ${from} → ${to}` },
          { id: `TRK-${from}-${to}-DN`, direction: "DOWN", label: "DOWN ←", description: `Direction: ${to} → ${from}` },
        ],
      });
    }
  }
  return result.length > 0 ? result : CORRIDOR_SECTIONS.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Future Train Movements (Operational Constraints on Selected Day: 17 Sep)
// Placed strictly on their designated track and direction!
// ---------------------------------------------------------------------------

export const FUTURE_TRAINS: FutureTrainMovement[] = [
  // NDLS - GZB
  {
    id: "TR-12951",
    number: "12951",
    name: "Mumbai Rajdhani",
    type: "passenger",
    sectionId: "SEC-NDLS-GZB",
    track: "UP",
    start: "22:50",
    end: "23:50",
    protectPath: true,
    note: "Premier passenger — protected path before block entry",
  },
  {
    id: "TR-12803",
    number: "12803",
    name: "Swarna Jayanti Exp",
    type: "passenger",
    sectionId: "SEC-NDLS-GZB",
    track: "UP",
    start: "05:00",
    end: "05:45",
    protectPath: true,
    note: "Morning passenger service after block handover",
  },
  {
    id: "TR-12958",
    number: "12958",
    name: "Swarna Rajdhani",
    type: "passenger",
    sectionId: "SEC-NDLS-GZB",
    track: "DOWN",
    start: "22:45",
    end: "23:45",
    protectPath: true,
    note: "Normal future movement on operational DOWN track",
  },
  {
    id: "TR-FT-882",
    number: "FT-882",
    name: "Port clearance freight",
    type: "freight",
    sectionId: "SEC-NDLS-GZB",
    track: "DOWN",
    start: "05:15",
    end: "06:00",
    note: "Freight path clear on DOWN track",
  },

  // GZB - ALD
  {
    id: "TR-12259",
    number: "12259",
    name: "Sealdah Duronto",
    type: "passenger",
    sectionId: "SEC-GZB-ALD",
    track: "UP",
    start: "23:30",
    end: "00:30",
    protectPath: true,
    note: "Premier Duronto path protected",
  },
  {
    id: "TR-12876",
    number: "12876",
    name: "Neelachal Exp",
    type: "passenger",
    sectionId: "SEC-GZB-ALD",
    track: "UP",
    start: "06:00",
    end: "07:00",
    note: "Morning scheduled movement",
  },
  {
    id: "TR-FT-903",
    number: "FT-903",
    name: "Rake placement CNB yard",
    type: "freight",
    sectionId: "SEC-GZB-ALD",
    track: "DOWN",
    start: "05:45",
    end: "06:30",
    note: "Held 15 min behind W2 release",
  },

  // ALD - CNB
  {
    id: "TR-12561",
    number: "12561",
    name: "Swatantrata Senani Exp",
    type: "passenger",
    sectionId: "SEC-ALD-CNB",
    track: "UP",
    start: "01:00",
    end: "02:00",
    protectPath: true,
    note: "Crosses before W3 possession",
  },
  {
    id: "TR-CONCOR-2210",
    number: "CONCOR-2210",
    name: "Double-stack container",
    type: "freight",
    sectionId: "SEC-ALD-CNB",
    track: "DOWN",
    start: "03:20",
    end: "04:40",
    note: "Heavy freight runs uninterrupted on DOWN line",
  },

  // CNB - PRYJ
  {
    id: "TR-12311",
    number: "12311",
    name: "Netaji Express",
    type: "passenger",
    sectionId: "SEC-CNB-PRYJ",
    track: "UP",
    start: "00:30",
    end: "01:30",
    note: "Normal movement",
  },
  {
    id: "TR-02612",
    number: "02612",
    name: "VIP Special (SECURE)",
    type: "special",
    sectionId: "SEC-CNB-PRYJ",
    track: "UP",
    start: "02:30",
    end: "05:00",
    protectPath: true,
    note: "Special security movement — mandatory clear corridor; adjacent blocks forbidden",
  },
  {
    id: "TR-12715",
    number: "12715",
    name: "Sachkhand Express",
    type: "passenger",
    sectionId: "SEC-CNB-PRYJ",
    track: "DOWN",
    start: "05:00",
    end: "06:00",
    note: "Morning service",
  },
];

// ---------------------------------------------------------------------------
// Future Maintenance Possession Blocks (Selected Day: 17 Sep)
// A block is the possession container — jobs are content of the block!
// ---------------------------------------------------------------------------

export const FUTURE_BLOCKS: FutureBlockWindow[] = [
  {
    id: "W1",
    sectionId: "SEC-NDLS-GZB",
    track: "UP",
    start: "01:00",
    end: "04:00",
    minutes: 180,
    status: "recommended",
    blockType: "Traffic Block (Maintenance)",
    jobIds: ["J-02", "J-09", "J-13"],
    trainImpactMin: 25,
    impactSummary: "25 minutes (1 passenger regulated +10m, 2 freight held)",
    unusedCapacityMin: 45,
    candidateJobIds: ["J-10", "J-13"],
    whySummary: [
      "Compatible maintenance bundled into one possession (CG-1 weld + signal lamp batch)",
      "Required resources available & confirmed (REMM-2 welding set, S&T lamp party)",
      "Required electrical & traffic isolation safely available on UP track",
      "Premier passenger paths (12951 Rajdhani) fully protected before block entry",
      "Adjacent DOWN track remains 100% operational for uninterrupted freight flow",
    ],
    feasibilityChecks: [
      { label: "Time window available without critical collision", satisfied: true },
      { label: "Required track isolation available", satisfied: true },
      { label: "Machinery & personnel resources confirmed", satisfied: true },
      { label: "Jobs chemically/physically compatible (CG-1)", satisfied: true },
      { label: "Protected future movements clear", satisfied: true },
    ],
  },
  {
    id: "W2",
    sectionId: "SEC-GZB-ALD",
    track: "DOWN",
    start: "01:30",
    end: "05:30",
    minutes: 240,
    status: "recommended",
    blockType: "Traffic & Power Block",
    jobIds: ["J-03", "J-04"],
    trainImpactMin: 15,
    impactSummary: "15 minutes (BCNA-47012 freight held at TDL for machine entry)",
    unusedCapacityMin: 90,
    candidateJobIds: ["J-05", "J-26"],
    whySummary: [
      "NCR sanctioned night corridor utilized after BCNA goods clear",
      "BCM-03 deep screening machine committed and positioned",
      "Sequential S&T failure recovery completed before heavy ballast machine pass",
      "DOWN track isolated; UP track carries all bilateral priority traffic",
    ],
    feasibilityChecks: [
      { label: "Time window available without critical collision", satisfied: true },
      { label: "Required track isolation available", satisfied: true },
      { label: "Machinery & personnel resources confirmed", satisfied: true },
      { label: "Jobs compatible in sequential window", satisfied: true },
      { label: "Protected future movements clear", satisfied: true },
    ],
  },
  {
    id: "W3",
    sectionId: "SEC-ALD-CNB",
    track: "UP",
    start: "01:30",
    end: "06:15",
    minutes: 285,
    status: "recommended",
    blockType: "Engineering Block",
    jobIds: ["J-07"],
    trainImpactMin: 0,
    impactSummary: "0 minutes (Path fits completely within natural traffic gap)",
    unusedCapacityMin: 120,
    candidateJobIds: ["J-27", "J-29"],
    whySummary: [
      "Lean freight window before morning junction release",
      "S&T EERC replacement crew on site with spinner test set",
      "No train regulations required",
    ],
    feasibilityChecks: [
      { label: "Time window available without critical collision", satisfied: true },
      { label: "Required track isolation available", satisfied: true },
      { label: "Machinery & personnel resources confirmed", satisfied: true },
      { label: "Jobs compatible", satisfied: true },
      { label: "Protected future movements clear", satisfied: true },
    ],
  },
  {
    id: "BLK-2026-0412",
    sectionId: "SEC-CNB-PRYJ",
    track: "DOWN",
    start: "01:30",
    end: "04:45",
    minutes: 195,
    status: "approved",
    blockType: "Sanctioned Rolling Block",
    jobIds: [],
    trainImpactMin: 0,
    impactSummary: "Sanctioned block BLK-2026-0412 (RGM-04 rail grinding)",
    unusedCapacityMin: 0,
    candidateJobIds: [],
    whySummary: [
      "Already sanctioned by NCR Headquarters for RGM-04 rail grinding",
      "Protected 02612 VIP special running on adjacent UP track respects this window",
    ],
    feasibilityChecks: [
      { label: "Sanctioned authorization valid", satisfied: true },
      { label: "Adjacent clearance respected", satisfied: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Candidate Alternative Windows for Deferred Jobs ("Find Feasible Slot")
// ---------------------------------------------------------------------------

export const ALTERNATIVE_WINDOWS_MAP: Record<string, FeasibleAlternativeWindow[]> = {
  "J-05": [
    {
      windowId: "W2",
      date: "2026-09-23",
      startTime: "04:10",
      endTime: "05:30",
      durationMin: 80,
      isFeasible: true,
      trainConflict: false,
      resourcesAvailable: true,
      compatibleWork: true,
      trainImpactDeltaMin: 8,
      utilizationDeltaPct: 17,
      note: "No train conflict · TW-925 tower wagon available · Bundles with S&T audit",
    },
    {
      windowId: "W3",
      date: "2026-09-23",
      startTime: "01:30",
      endTime: "03:00",
      durationMin: 90,
      isFeasible: false,
      trainConflict: true,
      resourcesAvailable: true,
      compatibleWork: false,
      trainImpactDeltaMin: 35,
      utilizationDeltaPct: 0,
      note: "Insufficient duration & conflicting OHE power isolation requirement",
    },
    {
      windowId: "W1",
      date: "2026-09-24",
      startTime: "02:00",
      endTime: "03:30",
      durationMin: 90,
      isFeasible: true,
      trainConflict: false,
      resourcesAvailable: true,
      compatibleWork: true,
      trainImpactDeltaMin: 5,
      utilizationDeltaPct: 15,
      note: "Feasible window · Open capacity available after glued joint replacement",
    },
  ],
  "J-06": [
    {
      windowId: "W2",
      date: "2026-09-24",
      startTime: "02:00",
      endTime: "04:00",
      durationMin: 120,
      isFeasible: true,
      trainConflict: false,
      resourcesAvailable: true,
      compatibleWork: true,
      trainImpactDeltaMin: 10,
      utilizationDeltaPct: 22,
      note: "REMM access crane returns from POH and rostered",
    },
  ],
  "J-11": [
    {
      windowId: "MEGA-SUN",
      date: "2026-09-20",
      startTime: "10:00",
      endTime: "12:30",
      durationMin: 150,
      isFeasible: true,
      trainConflict: false,
      resourcesAvailable: true,
      compatibleWork: true,
      trainImpactDeltaMin: 15,
      utilizationDeltaPct: 25,
      note: "Sunday daylight mega-block — ideal safe slope cutting visibility",
    },
  ],
};

// ---------------------------------------------------------------------------
// Actionable Unused Capacity Cards Data
// ---------------------------------------------------------------------------

export interface ActionableOpenCapacity {
  blockId: string;
  sectionName: string;
  trackLabel: string;
  freeMinutes: number;
  totalMinutes: number;
  utilizationPct: number;
  candidateJobs: {
    id: string;
    title: string;
    dept: string;
    minutes: number;
    tier: number;
  }[];
}

export const ACTIONABLE_OPEN_CAPACITY: ActionableOpenCapacity[] = [
  {
    blockId: "W1",
    sectionName: "NDLS–GZB",
    trackLabel: "UP Track",
    freeMinutes: 45,
    totalMinutes: 180,
    utilizationPct: 75,
    candidateJobs: [
      { id: "J-13", title: "Motor trolley & packset patrol", dept: "Engineering", minutes: 30, tier: 4 },
      { id: "J-10", title: "OHE mast pivot lubrication", dept: "TRD", minutes: 45, tier: 4 },
    ],
  },
  {
    blockId: "W2",
    sectionName: "GZB–ALD",
    trackLabel: "DOWN Track",
    freeMinutes: 90,
    totalMinutes: 240,
    utilizationPct: 62,
    candidateJobs: [
      { id: "J-26", title: "Digital axle counter software health audit", dept: "S&T", minutes: 60, tier: 4 },
      { id: "J-12", title: "Cable route inspection & marking", dept: "S&T", minutes: 90, tier: 4 },
      { id: "J-21", title: "Culvert structural inspection", dept: "Engineering", minutes: 90, tier: 3 },
    ],
  },
  {
    blockId: "W3",
    sectionName: "ALD–CNB",
    trackLabel: "UP Track",
    freeMinutes: 120,
    totalMinutes: 285,
    utilizationPct: 58,
    candidateJobs: [
      { id: "J-27", title: "Traction sub-station transformer test", dept: "TRD", minutes: 120, tier: 3 },
      { id: "J-29", title: "Signal cable insulation meggering", dept: "S&T", minutes: 120, tier: 3 },
    ],
  },
];

// Helper selectors
export function getHorizonJobById(id: string): HorizonJob | undefined {
  return HORIZON_JOBS.find((j) => j.id === id);
}

export function getJobsForDate(dateStr: string): HorizonJob[] {
  return HORIZON_JOBS.filter((j) => j.plannedDate === dateStr);
}

export function getJobsForBlock(blockId: string): HorizonJob[] {
  return HORIZON_JOBS.filter((j) => j.blockId === blockId);
}
