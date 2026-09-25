// ---------------------------------------------------------------------------
// Operational picture for the planning night — 100% synthetic / mock data.
// Corridors intentionally mirror the Network Schematic (NDLS–BSB trunk).
// ---------------------------------------------------------------------------

export interface Corridor {
  id: string;
  label: string;
  line: "UP" | "DOWN" | "SINGLE";
}

export interface BlockWindow {
  id: string;
  corridorId: string;
  start: string; // "HH:MM"
  end: string;
  minutes: number;
  note: string;
}

export interface Train {
  id: string;
  number: string;
  name: string;
  type: "passenger" | "freight" | "special";
  corridorId: string;
  start: string;
  end: string;
  note?: string;
}

export interface ExistingBlock {
  id: string;
  blockId: string;
  corridorId: string;
  start: string;
  end: string;
  status: "approved" | "pending";
  work: string;
}

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string; // short headline — the only text shown on the card
  time: string;
  section?: string;
  jobId?: string;
  text: string; // full explanation — drawer only
  consequence: string; // operational consequence — drawer only
  action: string; // recommended action — drawer only
}

export const PLAN_DATE = "Night of Mon 14 → Tue 15 Sep 2026";
export const PLAN_VERSION = "v2026.09.15 · r3";
export const PLAN_VERSION_NEXT = "v2026.09.15 · r4";

export const corridors: Corridor[] = [
  { id: "C1", label: "NDLS–GZB (UP)", line: "UP" },
  { id: "C2", label: "TDL–CNB (DOWN)", line: "DOWN" },
  { id: "C3", label: "PRYJ–DDU (UP)", line: "UP" },
  { id: "C4", label: "GZB–ALJN (DOWN)", line: "DOWN" },
  { id: "C5", label: "DDU–BSB (Single)", line: "SINGLE" },
];

export const corridorLabel = (id: string): string =>
  corridors.find((c) => c.id === id)?.label ?? id;

/** Proposed maintenance windows for the planning night. */
export const blockWindows: BlockWindow[] = [
  {
    id: "W1",
    corridorId: "C1",
    start: "01:00",
    end: "04:00",
    minutes: 180,
    note: "Traffic gap between Down Rajdhani paths and early freight",
  },
  {
    id: "W2",
    corridorId: "C2",
    start: "01:30",
    end: "05:30",
    minutes: 240,
    note: "NCR sanctioned night corridor after BCNA goods clear",
  },
  {
    id: "W3",
    corridorId: "C3",
    start: "01:30",
    end: "06:15",
    minutes: 285,
    note: "Lean freight window before MGS junction release",
  },
];

/** Trains inside the 22:00–08:00 planning horizon. */
export const trains: Train[] = [
  { id: "T1", number: "12951", name: "Mumbai Rajdhani", type: "passenger", corridorId: "C1", start: "22:50", end: "23:50", note: "Premier passenger — protect path" },
  { id: "T2", number: "12313", name: "Sealdah Rajdhani", type: "passenger", corridorId: "C1", start: "23:55", end: "00:55", note: "Premier passenger — protect path" },
  { id: "T3", number: "BCNA-47012", name: "BOXN goods", type: "freight", corridorId: "C2", start: "00:40", end: "02:10" },
  { id: "T4", number: "CONCOR-2210", name: "Double-stack container", type: "freight", corridorId: "C3", start: "03:20", end: "04:40" },
  { id: "T5", number: "FT-882", name: "Port clearance freight", type: "freight", corridorId: "C1", start: "05:15", end: "06:00" },
  { id: "T6", number: "02612", name: "VIP Special (SECURE)", type: "special", corridorId: "C4", start: "02:30", end: "05:00", note: "Runs on UP; DOWN under sanctioned block BLK-2026-0412" },
  { id: "T7", number: "FT-903", name: "Rake placement CNB yard", type: "freight", corridorId: "C2", start: "05:45", end: "06:30" },
];

/** Blocks already sanctioned / pending — same IDs as the Network Schematic. */
export const existingBlocks: ExistingBlock[] = [
  { id: "E1", blockId: "BLK-2026-0412", corridorId: "C4", start: "01:30", end: "04:45", status: "approved", work: "Rail grinding RGM-04 (Engineering)" },
  { id: "E2", blockId: "BLK-2026-0417", corridorId: "C2", start: "23:30", end: "03:00", status: "pending", work: "EI renewal & point machine overhaul (S&T)" },
  { id: "E3", blockId: "BLK-2026-0423", corridorId: "C5", start: "02:00", end: "05:30", status: "approved", work: "OHE catenary renewal (TRD)" },
];

export const alerts: Alert[] = [
  {
    id: "A1",
    severity: "critical",
    title: "Tier 0 — OHE insulator failure at DDU–BSB",
    time: "20:41",
    section: "DDU–BSB KM 74/12",
    jobId: "J-01",
    text: "OHE insulator shattered at KM 74/12. The section must not carry traffic until the insulator is replaced.",
    consequence: "Through traffic stopped on the single-line DDU–BSB section until replacement is complete.",
    action: "J-01 (Tier 0) rides inside sanctioned block BLK-2026-0423 (02:00–05:30) with tower wagon TW-925.",
  },
  {
    id: "A2",
    severity: "warning",
    title: "BLK-2026-0417 approval closes in 6 h",
    time: "21:05",
    section: "TDL–CNB DOWN",
    jobId: "J-03",
    text: "Pending block BLK-2026-0417 (TDL–CNB DOWN, 23:30–03:00) approval window closes in 6 hours.",
    consequence: "S&T crew standby lapses after the deadline; the EI renewal loses its night slot.",
    action: "Approve or modify the pending request in Human Approval before 03:00 IST.",
  },
  {
    id: "A3",
    severity: "warning",
    title: "02612 VIP special runs 02:30–05:00",
    time: "18:20",
    section: "GZB–ALJN UP",
    text: "Special movement 02612 (VIP, SECURE) runs 02:30–05:00 adjacent to block BLK-2026-0412 DOWN.",
    consequence: "No further blocks on GZB–ALJN; the adjacent UP line stays clear for the movement.",
    action: "Plan already respects the special — W1 work on NDLS–GZB ends before 02:30.",
  },
  {
    id: "A4",
    severity: "info",
    title: "BCM-03 window confirmed 00:30–06:00",
    time: "17:55",
    section: "TDL–CNB",
    text: "BCM-03 tamping machine availability confirmed 00:30–06:00 (TDL–CNB). REMM-2 welding set committed to W1.",
    consequence: "W2 ballast cleaning (J-04) can run the full 240-minute possession.",
    action: "No controller action needed — resource locked in the plan.",
  },
];

/** Data-source status strip (Command Center footer) — every feed is simulated. */
export const DATA_SOURCES: { id: string; label: string }[] = [
  { id: "TMS", label: "Train Mgmt System" },
  { id: "SMMS", label: "Safety Monitoring" },
  { id: "TDMS", label: "Track Data Mgmt" },
  { id: "BDMS", label: "Bridge Data Mgmt" },
  { id: "COA", label: "Control Office" },
  { id: "TIMETABLE", label: "Timetable" },
];
