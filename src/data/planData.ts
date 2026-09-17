// ---------------------------------------------------------------------------
// The Recommended Block Plan, conflict explanations, decision history and the
// weekly / monthly planning picture. All synthetic.
// ---------------------------------------------------------------------------

import { PLAN_VERSION } from "./opsData";

export type ReasonCode =
  | "INSUFFICIENT_WINDOW"
  | "TRAIN_CONFLICT"
  | "RESOURCE_CONFLICT"
  | "ISOLATION_CONFLICT"
  | "INCOMPATIBLE_WORK"
  | "LOWER_PRIORITY";

export interface PlanAssignment {
  jobId: string;
  windowId: string; // W1/W2/W3 or E1/E2/E3 (existing sanctioned block)
  start: string;
  end: string;
  parallel?: boolean;
  note?: string;
}

export interface DeferredJob {
  jobId: string;
  code: ReasonCode;
  reason: string;
}

export const recommendedPlan: {
  version: string;
  date: string;
  assignments: PlanAssignment[];
  deferred: DeferredJob[];
  trainImpact: string[];
  resources: string[];
} = {
  version: PLAN_VERSION,
  date: "Night of Mon 14 → Tue 15 Sep 2026",
  assignments: [
    { jobId: "J-01", windowId: "E3", start: "02:00", end: "04:00", note: "Inside sanctioned OHE block BLK-2026-0423" },
    { jobId: "J-13", windowId: "W1", start: "01:00", end: "01:45", note: "Line-side trolley patrol — spare capacity" },
    { jobId: "J-02", windowId: "W1", start: "02:00", end: "03:30" },
    { jobId: "J-09", windowId: "W1", start: "02:00", end: "03:00", parallel: true, note: "Line-side work under same protection" },
    { jobId: "J-04", windowId: "W2", start: "01:30", end: "05:30", note: "BCM-03 full possession" },
    { jobId: "J-05", windowId: "W3", start: "01:30", end: "03:00", note: "Feed isolated 01:30" },
    { jobId: "J-07", windowId: "W3", start: "03:15", end: "06:15", note: "After power certification + 15 min handover" },
  ],
  deferred: [
    { jobId: "J-06", code: "RESOURCE_CONFLICT", reason: "REMM access crane committed to the TDL–CNB possession; no second crane rostered before 17 Sep." },
    { jobId: "J-10", code: "LOWER_PRIORITY", reason: "Tier 4 routine — NDLS–GZB window reserved for the Tier 1 rail weld; lubrication holds safely to 05 Oct." },
    { jobId: "J-11", code: "INSUFFICIENT_WINDOW", reason: "Needs a daylight possession for safe working in a cutting; only night windows exist this week — bundled into the Sun 20 Sep mega-block." },
    { jobId: "J-12", code: "TRAIN_CONFLICT", reason: "02612 VIP special occupies 02:30–05:00; the duct inspection needs 90 min clear of all movements — no overlap tonight." },
  ],
  trainImpact: [
    "12951 Mumbai Rajdhani — path protected, no regulation.",
    "BCNA-47012 freight held 15 min at TDL for machine entry (W2).",
    "FT-882 port freight regulated +10 min behind W1 release.",
  ],
  resources: [
    "BCM-03 + ballast regulator (W2)",
    "REMM-2 welding set (W1)",
    "Tower wagon TW-925 (E3 / W3)",
    "S&T lamp party (W1, parallel)",
    "OHE crews A + B",
    "P-Way welding party",
  ],
};

// ---------------------------------------------------------------------------
// Conflicts & explanations — plain language, one per reason category.
// ---------------------------------------------------------------------------

export interface ConflictEntry {
  code: ReasonCode;
  subject: string;
  what: string;
  means: string;
  remedy: string;
}

export const conflictEntries: ConflictEntry[] = [
  {
    code: "INSUFFICIENT_WINDOW",
    subject: "J-11 · Vegetation clearance deferred",
    what: "The job needs 120 minutes in daylight for safe working in a cutting; only night windows exist this week.",
    means: "It cannot be done safely inside any proposed window — this is a safety constraint, not a priority judgement.",
    remedy: "Bundled into the Sunday 20 Sep mega-block (08:00–14:00, 360 min).",
  },
  {
    code: "TRAIN_CONFLICT",
    subject: "J-12 · Cable route inspection deferred",
    what: "02612 VIP special occupies 02:30–05:00 on the adjacent line; the inspection needs 90 minutes clear of all movements.",
    means: "A safe gap that respects the special's protection does not exist tonight.",
    remedy: "Planned for 16 Sep — the first night without a special movement.",
  },
  {
    code: "RESOURCE_CONFLICT",
    subject: "J-06 · Girder bridge bearing inspection deferred",
    what: "The REMM access crane is committed to the TDL–CNB possession; no second crane is rostered before 17 Sep.",
    means: "The job is ready and the crew is available — only the crane is missing.",
    remedy: "Slotted for Thu 17 Sep when the crane returns from POH.",
  },
  {
    code: "ISOLATION_CONFLICT",
    subject: "Extra OHE isolation at PRYJ yard — not granted tonight",
    what: "The TRD dispatcher allows only one feed isolation per night; W3 already isolates the PRYJ–DDU feed.",
    means: "Two simultaneous isolations would leave the yard without power for emergency working.",
    remedy: "Yard isolation moved to 16 Sep. No impact on the Tier 2 job J-05 inside W3.",
  },
  {
    code: "INCOMPATIBLE_WORK",
    subject: "CG-3 · Ballast cleaning + cable inspection not combined",
    what: "BCM-03 excavates the ballast profile over the yard cable ducts while the S&T party would need access to the same stretch.",
    means: "Same corridor — but the work methods are mutually unsafe. Proximity alone never proves compatibility.",
    remedy: "Cable inspection re-planned to a night without machine possessions.",
  },
  {
    code: "LOWER_PRIORITY",
    subject: "J-10 · OHE mast pivot lubrication deferred",
    what: "The NDLS–GZB window is reserved for the Tier 1 rail fracture weld; only one welding party exists.",
    means: "A Tier 4 routine job never displaces Tier 1 safety-critical work when resources are scarce.",
    remedy: "Holds safely until 05 Oct; will ride the next window with spare capacity.",
  },
];

// ---------------------------------------------------------------------------
// Decision history
// ---------------------------------------------------------------------------

export interface DecisionEntry {
  id: string;
  ts: string;
  version: string;
  recommendation: string;
  action: "Approved" | "Modified" | "Rejected" | "Locked";
  overrideReason?: string;
  officer: string;
}

export const seedDecisions: DecisionEntry[] = [
  {
    id: "D-104",
    ts: "13 Sep 2026 · 21:12",
    version: "v2026.09.14 · r2",
    recommendation: "NDLS–BSB night plan — 3 windows, 5 jobs",
    action: "Modified",
    overrideReason: "Shifted W2 start +30 min to clear the delayed 12009 Shatabdi path before machine entry.",
    officer: "Dy. Chief Controller (BCT)",
  },
  {
    id: "D-103",
    ts: "13 Sep 2026 · 19:40",
    version: "v2026.09.14 · r1",
    recommendation: "TRD extension request — OHE block to 06:15",
    action: "Rejected",
    overrideReason: "Extension would encroach the 12801 Purushottam express path. Asked TRD to split into two shorter blocks.",
    officer: "Dy. Chief Controller (BCT)",
  },
  {
    id: "D-102",
    ts: "12 Sep 2026 · 20:05",
    version: "v2026.09.13 · r1",
    recommendation: "NDLS–BSB night plan — 2 windows, 4 jobs",
    action: "Approved",
    officer: "Dy. Chief Controller (BCT)",
  },
  {
    id: "D-101",
    ts: "11 Sep 2026 · 18:30",
    version: "v2026.09.12 · r3",
    recommendation: "Weekly plan W37 — Sunday mega-block",
    action: "Locked",
    overrideReason: "Locked for the divisional inspection review at 09:00 — no further edits permitted.",
    officer: "Dy. Chief Controller (BCT)",
  },
];

// ---------------------------------------------------------------------------
// Weekly / monthly planning picture
// ---------------------------------------------------------------------------

export interface WeekDay {
  day: string;
  date: string;
  blocks: number;
  minutes: number;
  util: number;
  note: string;
}

export const weekPlan: WeekDay[] = [
  { day: "Mon", date: "14 Sep", blocks: 3, minutes: 615, util: 78, note: "Tonight — existing blocks 0412 / 0417 / 0423 in force" },
  { day: "Tue", date: "15 Sep", blocks: 3, minutes: 705, util: 91, note: "Recommended plan r3 — 7 jobs across 3 corridors" },
  { day: "Wed", date: "16 Sep", blocks: 2, minutes: 390, util: 74, note: "J-12 cable inspection; PRYJ yard isolation granted" },
  { day: "Thu", date: "17 Sep", blocks: 1, minutes: 180, util: 62, note: "J-06 bridge inspection — REMM crane back from POH" },
  { day: "Fri", date: "18 Sep", blocks: 2, minutes: 300, util: 70, note: "J-08 tamping (TCP machine returns 17 Sep)" },
  { day: "Sat", date: "19 Sep", blocks: 1, minutes: 150, util: 55, note: "Dense freight night — minimal blocks only" },
  { day: "Sun", date: "20 Sep", blocks: 1, minutes: 360, util: 68, note: "Sunday mega-block — J-11 vegetation + Tier 4 bank" },
];

export interface AssetAvail {
  name: string;
  avail: number;
  note: string;
}

export const monthSummary = {
  plannedBlocks: 46,
  plannedMinutes: 8940,
  deferredCount: 9,
  deadlinesNear: [
    "J-02 rail weld — due 16 Sep",
    "J-05 OHE tension — overdue (10 Sep)",
    "J-04 ballast cleaning — overdue (12 Sep)",
  ],
  utilizationTrend: [68, 72, 74, 71],
  projectedUtil: 87,
  assets: [
    { name: "BCM-03 ballast cleaning machine", avail: 82, note: "Rostered 14–15 Sep; POH from 25 Sep" },
    { name: "TW-925 tower wagon", avail: 65, note: "Committed 15 & 18 Sep (OHE work)" },
    { name: "REMM-2 welding set", avail: 90, note: "Committed to W1 tonight" },
    { name: "TCP tamping machine", avail: 0, note: "POH until 17 Sep — J-08 scheduled 18 Sep" },
  ] as AssetAvail[],
};

/** Next feasible window per deferred job (drawer detail). */
export const conflictNext: Record<string, string> = {
  "J-06": "Thu 17 Sep — REMM crane returns from POH",
  "J-10": "05 Oct — spare Tier 4 capacity",
  "J-11": "Sun 20 Sep — mega-block 360 min",
  "J-12": "Wed 16 Sep — no special movement scheduled",
  "J-13": "Wed 16 Sep — W1 rebuilt without the reserved movement",
};

/** Approaching deadlines as structured rows (Weekly/Monthly view). */
export const deadlines: { jobId: string; label: string; due: string; tier: number; overdue: boolean }[] = [
  { jobId: "J-05", label: "OHE auto-tension adjustment", due: "10 Sep", tier: 2, overdue: true },
  { jobId: "J-04", label: "Ballast cleaning — deep screening", due: "12 Sep", tier: 2, overdue: true },
  { jobId: "J-02", label: "Rail fracture weld repair", due: "16 Sep", tier: 1, overdue: false },
  { jobId: "J-03", label: "Tundla EI failure recovery", due: "Tonight", tier: 1, overdue: false },
];

/** Per-day planning detail — opened in the day drawer on click. */
export const weekDetail: Record<
  string,
  { critical: number; alert: string; blocks: string[]; jobs: string[]; deferred: string[]; impact: string[]; resources: string[]; notes: string }
> = {
  "14 Sep": { critical: 3, alert: "BLK-0417 approval pending", blocks: ["BLK-2026-0412 · 01:30–04:45", "BLK-2026-0417 · 23:30–03:00", "BLK-2026-0423 · 02:00–05:30"], jobs: ["RGM-04 rail grinding", "EI renewal (S&T)", "OHE catenary renewal"], deferred: ["J-06 bridge inspection → 17 Sep"], impact: ["02612 special protected", "1 freight regulated"], resources: ["RGM-04", "Tower wagon TW-925", "S&T EI team"], notes: "Tonight — existing sanctioned blocks in force; plan r3 built for tomorrow night." },
  "15 Sep": { critical: 2, alert: "Officer approval pending for r3", blocks: ["W1 · 01:00–04:00", "W2 · 01:30–05:30", "W3 · 01:30–06:15"], jobs: ["J-01 OHE insulator (T0)", "J-02 rail weld (T1)", "J-04 BCM (T2)", "J-05 tension (T2)", "J-07 axle counter (T3)", "J-13 trolley patrol (T4)", "J-09 lamps (T4)"], deferred: ["J-06 → 17 Sep", "J-10 → 05 Oct", "J-11 → 20 Sep", "J-12 → 16 Sep"], impact: ["3 minor regulations", "02612 path protected"], resources: ["BCM-03", "REMM-2", "TW-925", "OHE crews A+B"], notes: "Recommended plan r3 — 7 jobs across 3 corridors, 91% utilization." },
  "16 Sep": { critical: 1, alert: "J-02 weld deadline", blocks: ["W1 · 02:00–04:30", "W2 · 01:30–04:00"], jobs: ["J-12 cable inspection", "J-02 weld re-check"], deferred: ["J-04 balance pass"], impact: ["1 freight regulated"], resources: ["S&T cable party"], notes: "PRYJ yard isolation granted; J-12 re-planned away from BCM nights." },
  "17 Sep": { critical: 1, alert: "REMM crane back from POH", blocks: ["W1 · 01:00–04:00"], jobs: ["J-06 bridge bearing inspection"], deferred: [], impact: ["No regulations"], resources: ["REMM-2 + access crane"], notes: "Bridge inspection rescheduled from tonight." },
  "18 Sep": { critical: 0, alert: "TCP machine returns 17 Sep", blocks: ["W2 · 01:30–05:00", "W3 · 02:00–04:00"], jobs: ["J-08 tamping (curve CC 8+2)"], deferred: [], impact: ["1 freight held 10 min"], resources: ["TCP tamping machine"], notes: "First tamping slot after machine POH." },
  "19 Sep": { critical: 0, alert: "Dense freight night", blocks: ["W1 · 02:30–04:00"], jobs: ["Routine inspections"], deferred: [], impact: ["Freight priority — minimal blocks"], resources: ["—"], notes: "Dense freight night — minimal blocks only." },
  "20 Sep": { critical: 1, alert: "Sunday mega-block 360 min", blocks: ["MEGA · 00:30–06:30"], jobs: ["J-11 vegetation clearance", "Tier 4 bank"], deferred: [], impact: ["Corridor closed PRYJ–DDU"], resources: ["VGR party", "Chainsaw kit"], notes: "Sunday mega-block — deferred bank cleared." },
};

/** Extended audit detail per seeded decision (drawer only). */
export const decisionAudit: Record<
  string,
  { reasonShort: string; original: string; revised: string; jobsAffected: string; blocksAffected: string; related: string }
> = {
  "D-104": { reasonShort: "Train conflict", original: "W2 start 01:30", revised: "W2 start 02:00 (+30 min)", jobsAffected: "J-04 entry re-timed", blocksAffected: "BLK-2026-0417 (TDL–CNB DOWN)", related: "Simulation S6 — operational constraint" },
  "D-103": { reasonShort: "Train conflict", original: "OHE block to 06:15", revised: "Split into 2 shorter blocks", jobsAffected: "J-05 OHE tension", blocksAffected: "PRYJ–DDU UP", related: "12801 Purushottam path protection" },
  "D-102": { reasonShort: "—", original: "2 windows · 4 jobs", revised: "—", jobsAffected: "—", blocksAffected: "NDLS–GZB · TDL–CNB", related: "—" },
  "D-101": { reasonShort: "Locked for audit", original: "Weekly plan W37", revised: "—", jobsAffected: "All W37 jobs", blocksAffected: "Sunday mega-block", related: "Divisional inspection 09:00" },
};

