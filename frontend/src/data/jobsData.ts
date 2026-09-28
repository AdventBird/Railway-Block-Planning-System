// ---------------------------------------------------------------------------
// Unified maintenance jobs (synthetic feed from TMS / SMMS / TDMS) with the
// Tier 0–4 priority rulebook — no numeric "AI scores".
// ---------------------------------------------------------------------------

export type Dept = "Engineering" | "S&T" | "TRD";
export type SourceSystem = "TMS" | "SMMS" | "TDMS" | "BDMS";

export interface Job {
  id: string;
  title: string;
  dept: Dept;
  source: SourceSystem;
  corridorId: string;
  sectionId: string;
  trackId: string;
  direction: "UP" | "DOWN" | "BOTH";
  asset: string;
  minutes: number; // Work duration in minutes
  setupMinutes: number; // Setup duration
  restoreMinutes: number; // Restore duration
  deadline: string; // Authoritative ISO 8601 string, e.g. "2026-09-15T05:45:00+05:30"
  tier: 0 | 1 | 2 | 3 | 4;
  tierReason: string;
  resources: string[];
  needsPowerIsolation?: boolean;
  status: "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "CLOSED";
  plannedDate?: string;
}

export const REFERENCE_DATE = "2026-09-14T18:00:00+05:30";

export function isJobOverdue(deadlineIso: string, ref = REFERENCE_DATE): boolean {
  if (!deadlineIso) return false;
  return new Date(deadlineIso).getTime() < new Date(ref).getTime();
}

export function formatJobDeadline(deadlineIso: string): string {
  if (!deadlineIso) return "";
  const d = new Date(deadlineIso);
  if (isNaN(d.getTime())) return deadlineIso;
  const day = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
  const hours = d.getHours();
  const mins = d.getMinutes();
  if (hours !== 0 || mins !== 0) {
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
    return `${day} ${time}`;
  }
  return day;
}

export function totalPossessionMinutes(job: Job): number {
  return (job.setupMinutes || 0) + (job.minutes || 0) + (job.restoreMinutes || 0);
}

export const jobs: Job[] = [
  {
    id: "J-01",
    title: "OHE insulator replacement (shattered)",
    dept: "TRD",
    source: "TDMS",
    corridorId: "C5",
    sectionId: "SEC-DDU-BSB",
    trackId: "TRK-DDU-BSB-SL",
    direction: "BOTH",
    asset: "OHE mast 74/12 + insulator assembly",
    minutes: 120,
    setupMinutes: 20,
    restoreMinutes: 15,
    deadline: "2026-09-15T05:45:00+05:30",
    tier: 0,
    tierReason:
      "Mandatory safety — insulator shattered, OHE cannot be energized; section cannot carry traffic until replaced.",
    resources: ["Tower wagon TW-925", "OHE crew A", "Power isolation: DDU feed"],
    needsPowerIsolation: true,
    status: "IN_PROGRESS",
    plannedDate: "15 Sep",
  },
  {
    id: "J-02",
    title: "Rail fracture weld repair",
    dept: "Engineering",
    source: "TMS",
    corridorId: "C1",
    sectionId: "SEC-NDLS-GZB",
    trackId: "TRK-NDLS-GZB-UP",
    direction: "UP",
    asset: "UP rail KM 18/4 (52 kg / 90 UTS)",
    minutes: 90,
    setupMinutes: 15,
    restoreMinutes: 10,
    deadline: "2026-09-16T04:00:00+05:30",
    tier: 1,
    tierReason:
      "USFD-detected fracture; 30 km/h caution imposed — weld must restore full speed before the morning Rajdhani path.",
    resources: ["REMM-2 welding set", "P-Way welding party"],
    status: "OPEN",
    plannedDate: "15 Sep",
  },
  {
    id: "J-03",
    title: "Tundla panel interlocking failure recovery",
    dept: "S&T",
    source: "SMMS",
    corridorId: "C2",
    sectionId: "SEC-TDL-CNB",
    trackId: "TRK-TDL-CNB-UP",
    direction: "UP",
    asset: "EI panel PMC-7 at Tundla",
    minutes: 60,
    setupMinutes: 10,
    restoreMinutes: 10,
    deadline: "2026-09-15T02:00:00+05:30",
    tier: 1,
    tierReason:
      "Point operation failing intermittently — signals worked at caution; S&T failure team on standby at site.",
    resources: ["S&T failure team", "Panel spare modules"],
    status: "ACKNOWLEDGED",
    plannedDate: "15 Sep",
  },
  {
    id: "J-04",
    title: "Ballast cleaning (BCM) — deep screening",
    dept: "Engineering",
    source: "TMS",
    corridorId: "C2",
    sectionId: "SEC-TDL-CNB",
    trackId: "TRK-TDL-CNB-DN",
    direction: "DOWN",
    asset: "DOWN track KM 121/8–125/2",
    minutes: 240,
    setupMinutes: 30,
    restoreMinutes: 20,
    deadline: "2026-09-12T00:00:00+05:30",
    tier: 2,
    tierReason:
      "Overdue 2 days — track geometry deteriorating; 40 km/h TSR at risk of being tightened if not worked this week.",
    resources: ["BCM-03", "Ballast regulator", "BRNA men"],
    status: "OPEN",
    plannedDate: "15 Sep",
  },
  {
    id: "J-05",
    title: "OHE auto-tension adjustment",
    dept: "TRD",
    source: "TDMS",
    corridorId: "C3",
    sectionId: "SEC-PRYJ-DDU",
    trackId: "TRK-PRYJ-DDU-UP",
    direction: "UP",
    asset: "Regulation anchor KM 88/6",
    minutes: 90,
    setupMinutes: 15,
    restoreMinutes: 10,
    deadline: "2026-09-10T00:00:00+05:30",
    tier: 2,
    tierReason:
      "Overdue — tension outside limits; accelerating pantograph wear and dewirement risk in high wind.",
    resources: ["Tower wagon TW-925", "OHE crew B"],
    needsPowerIsolation: true,
    status: "OPEN",
    plannedDate: "15 Sep",
  },
  {
    id: "J-06",
    title: "Girder bridge bearing inspection",
    dept: "Engineering",
    source: "BDMS",
    corridorId: "C3",
    sectionId: "SEC-PRYJ-DDU",
    trackId: "TRK-PRYJ-DDU-DN",
    direction: "DOWN",
    asset: "Bridge No. 41 (2 × 12.2 m girders)",
    minutes: 120,
    setupMinutes: 20,
    restoreMinutes: 15,
    deadline: "2026-09-30T00:00:00+05:30",
    tier: 3,
    tierReason:
      "Post-monsoon mandatory inspection cycle (once in 90 days) — needs REMM access crane under traffic block.",
    resources: ["REMM access crane", "Bridge inspection party"],
    status: "OPEN",
    plannedDate: "17 Sep",
  },
  {
    id: "J-07",
    title: "Axle counter renewal (EERC)",
    dept: "S&T",
    source: "SMMS",
    corridorId: "C3",
    sectionId: "SEC-PRYJ-DDU",
    trackId: "TRK-PRYJ-DDU-UP",
    direction: "UP",
    asset: "PRYJ–block section (DC axle counters)",
    minutes: 180,
    setupMinutes: 15,
    restoreMinutes: 30,
    deadline: "2026-09-22T00:00:00+05:30",
    tier: 3,
    tierReason:
      "Ageing DC axle counters — 3 failures this month; EERC renewal removes adjustment-related failures.",
    resources: ["S&T EERC team", "Spinner tester"],
    status: "OPEN",
    plannedDate: "15 Sep",
  },
  {
    id: "J-08",
    title: "Track tamping (TCP) — post-grinding leveling",
    dept: "Engineering",
    source: "TMS",
    corridorId: "C4",
    sectionId: "SEC-GZB-ALJN",
    trackId: "TRK-GZB-ALJN-DN",
    direction: "DOWN",
    asset: "UP + DOWN KM 32–38",
    minutes: 240,
    setupMinutes: 30,
    restoreMinutes: 20,
    deadline: "2026-09-20T00:00:00+05:30",
    tier: 3,
    tierReason:
      "Leveling required after RGM-04 grinding pass; TCP machine out of POH until 17 Sep.",
    resources: ["TCP tamping machine", "Geometry car"],
    status: "OPEN",
    plannedDate: "18 Sep",
  },
  {
    id: "J-09",
    title: "Signal lamp replacement — batch",
    dept: "S&T",
    source: "SMMS",
    corridorId: "C1",
    sectionId: "SEC-NDLS-GZB",
    trackId: "TRK-NDLS-GZB-UP",
    direction: "UP",
    asset: "Signals S/12 · S/18 · S/24",
    minutes: 60,
    setupMinutes: 10,
    restoreMinutes: 10,
    deadline: "2026-09-30T00:00:00+05:30",
    tier: 4,
    tierReason:
      "Routine — lamps at 85% of life; batch replacement cuts night-time failure call-outs.",
    resources: ["S&T lamp party"],
    status: "OPEN",
    plannedDate: "15 Sep",
  },
  {
    id: "J-10",
    title: "OHE mast pivot lubrication",
    dept: "TRD",
    source: "TDMS",
    corridorId: "C1",
    sectionId: "SEC-NDLS-GZB",
    trackId: "TRK-NDLS-GZB-DN",
    direction: "DOWN",
    asset: "Masts 14–31",
    minutes: 90,
    setupMinutes: 10,
    restoreMinutes: 10,
    deadline: "2026-10-05T00:00:00+05:30",
    tier: 4,
    tierReason: "Routine preventive cycle — no functional degradation reported.",
    resources: ["OHE line party"],
    status: "OPEN",
    plannedDate: "05 Oct",
  },
  {
    id: "J-11",
    title: "Vegetation clearance — cuttings",
    dept: "Engineering",
    source: "TMS",
    corridorId: "C3",
    sectionId: "SEC-PRYJ-DDU",
    trackId: "TRK-PRYJ-DDU-UP",
    direction: "UP",
    asset: "KM 95–99 cuttings",
    minutes: 120,
    setupMinutes: 15,
    restoreMinutes: 15,
    deadline: "2026-09-30T00:00:00+05:30",
    tier: 4,
    tierReason:
      "Routine — monsoon growth; curve sighting at KM 97 acceptable but tightening.",
    resources: ["VGR party", "Chainsaw kit"],
    status: "OPEN",
    plannedDate: "20 Sep",
  },
  {
    id: "J-12",
    title: "Cable route inspection & marking",
    dept: "S&T",
    source: "SMMS",
    corridorId: "C2",
    sectionId: "SEC-TDL-CNB",
    trackId: "TRK-TDL-CNB-DN",
    direction: "DOWN",
    asset: "CNB yard cable ducts",
    minutes: 90,
    setupMinutes: 15,
    restoreMinutes: 15,
    deadline: "2026-10-08T00:00:00+05:30",
    tier: 4,
    tierReason: "Routine 6-monthly inspection; no open defects on the route.",
    resources: ["S&T cable party"],
    status: "OPEN",
    plannedDate: "16 Sep",
  },
  {
    id: "J-13",
    title: "Motor trolley & packset patrol",
    dept: "Engineering",
    source: "TMS",
    corridorId: "C1",
    sectionId: "SEC-NDLS-GZB",
    trackId: "TRK-NDLS-GZB-UP",
    direction: "UP",
    asset: "KM 10–24 track & trolley refuges",
    minutes: 45,
    setupMinutes: 10,
    restoreMinutes: 5,
    deadline: "2026-09-19T00:00:00+05:30",
    tier: 4,
    tierReason:
      "Routine weekly line-side patrol — trolley and packset only, no machines; rides any spare capacity in the W1 window.",
    resources: ["Motor trolley T-12", "Patrol party (2)"],
    status: "OPEN",
    plannedDate: "15 Sep",
  },
];

export const jobById = (id: string): Job | undefined => jobs.find((j) => j.id === id);

// ---------------------------------------------------------------------------
// Compatibility & bundling — decided by work method, isolation and resources.
// Same corridor NEVER implies compatibility (see CG-3).
// ---------------------------------------------------------------------------

export interface CompatGroup {
  id: string;
  title: string;
  status: "Compatible" | "Conditional" | "Incompatible";
  jobIds: string[];
  corridorId: string;
  execution: "Parallel" | "Sequential" | "Not possible";
  isolation: string;
  resources: string;
  setupHandover: string;
  possession: string;
  rationale: string;
}

export const compatGroups: CompatGroup[] = [
  {
    id: "CG-1",
    title: "Rail fracture weld + signal lamp batch",
    status: "Compatible",
    jobIds: ["J-02", "J-09"],
    corridorId: "C1",
    execution: "Parallel",
    isolation: "None beyond the standard traffic block — lamp party works line-side, clear of the welding plant.",
    resources: "REMM-2 welding set + S&T lamp party; no shared machines.",
    setupHandover: "15 min single protection arrangement; no handover needed.",
    possession: "90 min — the lamp batch completes inside the weld window.",
    rationale:
      "Compatible because the work methods do not interact and no conflicting isolation is required — not merely because both jobs lie on NDLS–GZB.",
  },
  {
    id: "CG-2",
    title: "OHE auto-tension adjustment + axle counter renewal",
    status: "Conditional",
    jobIds: ["J-05", "J-07"],
    corridorId: "C3",
    execution: "Sequential",
    isolation:
      "Conflicting: axle-counter testing needs the OHE energized, tension work needs the feed isolated.",
    resources: "Tower wagon TW-925 shared — must clear before S&T powered testing starts.",
    setupHandover: "15 min power certification + departmental handover.",
    possession: "285 min (90 + 15 handover + 180).",
    rationale:
      "Condition: the TRD dispatcher must certify the feed before S&T powered testing starts. If certification slips, the S&T portion slides to the next window — bundling is allowed only in this strict sequence.",
  },
  {
    id: "CG-3",
    title: "Ballast cleaning (BCM) + cable route inspection",
    status: "Incompatible",
    jobIds: ["J-04", "J-12"],
    corridorId: "C2",
    execution: "Not possible",
    isolation:
      "Conflict: BCM excavates the ballast profile over the cable ducts; S&T access is forbidden during excavation.",
    resources: "BCM-03 occupies the full track — no safe line-side access for a second party.",
    setupHandover: "—",
    possession: "—",
    rationale:
      "Same corridor does NOT imply compatibility: excavation over buried S&T assets and full-track machine occupancy make joint working unsafe. Cable inspection is re-planned away from BCM possessions.",
  },
];

/** Compact operational extras for dense rows + job detail drawers. */
export const jobOps: Record<string, { due: string; history: string; risk: string }> = {
  "J-01": { due: "05:45", history: "Insulator batch installed 2021; first failure on this section.", risk: "Section cannot carry traffic until replaced — highest operational priority." },
  "J-02": { due: "04:00", history: "Fracture detected by USFD run on 14 Sep morning.", risk: "30 km/h caution until welded; morning Rajdhani path at risk." },
  "J-03": { due: "Now", history: "Two intermittent failures logged in 48 h at TDL panel PMC-7.", risk: "Signals at caution — throughput capped at the Tundla throat." },
  "J-04": { due: "Overdue", history: "Last deep screening: Mar 2025 (cycle due Sep 2026).", risk: "40 km/h TSR may tighten to 30 km/h if deferred again." },
  "J-05": { due: "Overdue", history: "Tension drift logged for 3 weeks; anchor last adjusted Jun 2026.", risk: "Dewirement risk in high wind; pantograph wear accelerating." },
  "J-06": { due: "30 Sep", history: "90-day mandatory cycle; last inspected 05 Jul 2026.", risk: "Post-monsoon bearing settlement goes undetected if missed." },
  "J-07": { due: "20 Sep", history: "Axle-counter reset counts rising on PRYJ–DDU UP.", risk: "Failure risk grows with each monsoon reset cycle." },
  "J-08": { due: "30 Sep", history: "TCP tamping machine in POH until 17 Sep.", risk: "Geometry degradation on the CC 8+2 curve." },
  "J-09": { due: "17 Sep", history: "Half-yearly lamp batch; 14 of 26 signals completed.", risk: "Low — failed lamps have signal-repeater protection." },
  "J-10": { due: "05 Oct", history: "Pivot greased Apr 2026; temperature reports normal.", risk: "Low — routine preventive task." },
  "J-11": { due: "20 Sep", history: "Growth mapped in post-monsoon survey 12 Sep.", risk: "Sightline at the KM 97 curve is tightening." },
  "J-12": { due: "08 Oct", history: "Last route walkdown Mar 2026 — no defects.", risk: "Low — duct markers intact." },
  "J-13": { due: "19 Sep", history: "Weekly patrol; last run 08 Sep with no findings.", risk: "Low — line-side only, rides spare capacity." },
};
