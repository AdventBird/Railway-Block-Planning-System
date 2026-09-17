import type { Station, TrackSection } from "../types";

export const routeTitle = "NDLS – BSB Trunk (NCR Schematic)";

/**
 * 10 real stations along the Delhi – Varanasi trunk plus the Kanpur–Lucknow
 * branch, laid out left-to-right like a control-room line diagram (manual
 * positions, not auto-layout).
 *
 * Station nodes render at 160 x 64 px, so keep >= 260 px horizontal spacing
 * between neighbours on the same row.
 */
export const mockStations: Station[] = [
  { id: "NDLS", name: "New Delhi", code: "NDLS", x: 40, y: 250, junction: true },
  { id: "GZB", name: "Ghaziabad", code: "GZB", x: 300, y: 180, junction: true },
  { id: "ALJN", name: "Aligarh", code: "ALJN", x: 560, y: 220 },
  { id: "TDL", name: "Tundla Junction", code: "TDL", x: 820, y: 180, junction: true },
  { id: "CNB", name: "Kanpur Central", code: "CNB", x: 1080, y: 250, junction: true },
  { id: "FTP", name: "Fatehpur", code: "FTP", x: 1340, y: 200 },
  { id: "PRYJ", name: "Prayagraj Junction", code: "PRYJ", x: 1600, y: 260, junction: true },
  { id: "DDU", name: "Pt. Deen Dayal Upadhyaya Jn", code: "DDU", x: 1860, y: 200, junction: true },
  { id: "BSB", name: "Varanasi Junction", code: "BSB", x: 2120, y: 140 },
  { id: "LKO", name: "Lucknow Charbagh", code: "LKO", x: 1420, y: 40 },
];

/**
 * 14 track sections. UP/DOWN pairs between the same two stations render as
 * two parallel lines (lanes) in the diagram; singles render as one line.
 *
 * 2 blocked + 1 maintenance carry live block details, 1 caution is a speed
 * restriction without a formal block, 3 occupied (train on section).
 */
export const mockSections: TrackSection[] = [
  {
    id: "SEC-NDLS-GZB-UP",
    fromStationId: "NDLS",
    toStationId: "GZB",
    name: "New Delhi–Ghaziabad UP Line",
    status: "occupied",
    line: "UP",
  },
  {
    id: "SEC-NDLS-GZB-DN",
    fromStationId: "NDLS",
    toStationId: "GZB",
    name: "New Delhi–Ghaziabad DOWN Line",
    status: "clear",
    line: "DOWN",
  },
  {
    id: "SEC-GZB-ALJN-UP",
    fromStationId: "GZB",
    toStationId: "ALJN",
    name: "Ghaziabad–Aligarh UP Line",
    status: "clear",
    line: "UP",
  },
  {
    id: "SEC-GZB-ALJN-DN",
    fromStationId: "GZB",
    toStationId: "ALJN",
    name: "Ghaziabad–Aligarh DOWN Line",
    status: "blocked",
    line: "DOWN",
    currentBlock: {
      blockId: "BLK-2026-0412",
      reason:
        "Rail Grinding Machine RGM-04 working — ballast profiling & tamping between KM 32/8 and 38/2. Adjacent UP line worked on single-line token under caution order.",
      startTime: "01:30",
      endTime: "04:45",
      requestedBy: "Engineering",
      approvalStatus: "approved",
    },
  },
  {
    id: "SEC-ALJN-TDL",
    fromStationId: "ALJN",
    toStationId: "TDL",
    name: "Aligarh–Tundla Section",
    status: "caution",
    line: "SINGLE",
  },
  {
    id: "SEC-TDL-CNB-UP",
    fromStationId: "TDL",
    toStationId: "CNB",
    name: "Tundla–Kanpur UP Line",
    status: "clear",
    line: "UP",
  },
  {
    id: "SEC-TDL-CNB-DN",
    fromStationId: "TDL",
    toStationId: "CNB",
    name: "Tundla–Kanpur DOWN Line",
    status: "maintenance",
    line: "DOWN",
    currentBlock: {
      blockId: "BLK-2026-0417",
      reason:
        "Electronic Interlocking (EI) renewal & point machine 102A/B overhaul at Tundla yard throat. Pilot train verification required before throughput.",
      startTime: "23:30",
      endTime: "03:00",
      requestedBy: "S&T",
      approvalStatus: "pending",
    },
  },
  {
    id: "SEC-CNB-FTP-UP",
    fromStationId: "CNB",
    toStationId: "FTP",
    name: "Kanpur–Fatehpur UP Line",
    status: "occupied",
    line: "UP",
  },
  {
    id: "SEC-CNB-FTP-DN",
    fromStationId: "CNB",
    toStationId: "FTP",
    name: "Kanpur–Fatehpur DOWN Line",
    status: "clear",
    line: "DOWN",
  },
  {
    id: "SEC-FTP-PRYJ",
    fromStationId: "FTP",
    toStationId: "PRYJ",
    name: "Fatehpur–Prayagraj Section",
    status: "clear",
    line: "SINGLE",
  },
  {
    id: "SEC-PRYJ-DDU-UP",
    fromStationId: "PRYJ",
    toStationId: "DDU",
    name: "Prayagraj–DDU UP Line",
    status: "clear",
    line: "UP",
  },
  {
    id: "SEC-PRYJ-DDU-DN",
    fromStationId: "PRYJ",
    toStationId: "DDU",
    name: "Prayagraj–DDU DOWN Line",
    status: "occupied",
    line: "DOWN",
  },
  {
    id: "SEC-DDU-BSB",
    fromStationId: "DDU",
    toStationId: "BSB",
    name: "DDU–Varanasi Section",
    status: "blocked",
    line: "SINGLE",
    currentBlock: {
      blockId: "BLK-2026-0423",
      reason:
        "25 kV OHE catenary wire renewal — TRD power block between KM 74/12 and 78/4. Tower wagon & wiring train on line.",
      startTime: "02:00",
      endTime: "05:30",
      requestedBy: "TRD",
      approvalStatus: "approved",
    },
  },
  {
    id: "SEC-CNB-LKO",
    fromStationId: "CNB",
    toStationId: "LKO",
    name: "Kanpur–Lucknow Section",
    status: "clear",
    line: "SINGLE",
  },
];
/** Operational extras for the schematic section panel (progressive disclosure). */
export interface SectionOps {
  nextWindow: string;
  trainImpact: number;
  trainNote?: string;
  compat?: string;
  resources?: string;
  history?: string;
}

export const sectionOps: Record<string, SectionOps> = {
  "SEC-NDLS-GZB-UP": { nextWindow: "W1 · 01:00–04:00 (proposed)", trainImpact: 2, trainNote: "12951 + 12313 Rajdhani paths 22:50–00:55", compat: "CG-1 — weld + lamp batch compatible here", resources: "REMM-2 + S&T lamp party", history: "Weld repair scheduled (J-02)" },
  "SEC-NDLS-GZB-DN": { nextWindow: "Check W1 overflow", trainImpact: 0, history: "No blocks this week" },
  "SEC-GZB-ALJN-UP": { nextWindow: "None — VIP path 02:30–05:00", trainImpact: 1, trainNote: "02612 VIP special reserved", history: "No blocks this week" },
  "SEC-GZB-ALJN-DN": { nextWindow: "After 04:45 (block ends)", trainImpact: 1, trainNote: "UP line on single-line token caution", resources: "RGM-04 grinding train", history: "Last ground: 12 Jun 2026" },
  "SEC-ALJN-TDL": { nextWindow: "W1–W3 do not touch this section", trainImpact: 1, trainNote: "Caution order — restricted speed", history: "USFD fracture detected 14 Sep (J-02 nearby)" },
  "SEC-TDL-CNB-UP": { nextWindow: "—", trainImpact: 0, history: "No blocks this week" },
  "SEC-TDL-CNB-DN": { nextWindow: "W2 · 01:30–05:30 (proposed)", trainImpact: 2, trainNote: "BCNA-47012 held +15 min at TDL", compat: "CG-3 — BCM + cable inspection incompatible", resources: "BCM-03 + ballast regulator", history: "Last deep screening: Mar 2025" },
  "SEC-CNB-FTP-UP": { nextWindow: "—", trainImpact: 1, history: "No blocks this week" },
  "SEC-CNB-FTP-DN": { nextWindow: "—", trainImpact: 0, history: "No blocks this week" },
  "SEC-FTP-PRYJ": { nextWindow: "—", trainImpact: 0, history: "No blocks this week" },
  "SEC-PRYJ-DDU-UP": { nextWindow: "W3 · 01:30–06:15 (proposed)", trainImpact: 2, trainNote: "CONCOR-2210 passes 03:20–04:40", compat: "CG-2 — conditional: power certification between jobs", resources: "TW-925 + OHE crews A/B", history: "Axle-counter resets rising (J-07)" },
  "SEC-PRYJ-DDU-DN": { nextWindow: "—", trainImpact: 1, history: "No blocks this week" },
  "SEC-DDU-BSB": { nextWindow: "After 05:30 (block ends)", trainImpact: 2, trainNote: "Through traffic held until OHE restored", compat: "Tier 0 J-01 rides inside BLK-2026-0423", resources: "Tower wagon TW-925 + OHE crew A", history: "OHE renewed 2018; insulator failure 14 Sep" },
  "SEC-CNB-LKO": { nextWindow: "—", trainImpact: 0, history: "No blocks this week" },
};
