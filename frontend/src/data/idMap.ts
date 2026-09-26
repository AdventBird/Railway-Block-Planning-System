// ---------------------------------------------------------------------------
// ID BRIDGE — ONE documented correspondence between backend canonical ids and
// the seeded demo ids (§46: one canonical dataset, ids never silently renamed).
// ---------------------------------------------------------------------------
// The backend serves canonical ids taken from the source registers:
//   • windows → COA block ids (`BLK-2026-…`, backend/app/data/coa_blocks.json)
//   • jobs    → source register ids (`TMS-ENG-9001`, `SMMS-SIG-503`, …)
// The seeded demo data uses planning-desk ids (`W1…W3`, `E1…E3`, `J-01…J-13`).
// Every row below was derived from the registers themselves — same title,
// corridor and possession/duration on both sides — never invented:
//
//   BLK-2026-0412 ↔ E1   (existingBlocks.blockId — exact block number)
//   BLK-2026-0417 ↔ E2   (existingBlocks.blockId — exact block number)
//   BLK-2026-0423 ↔ E3   (existingBlocks.blockId — exact block number)
//   BLK-2026-0432 ↔ W1   (C1 01:00–04:00 — same corridor + possession times)
//   BLK-2026-0431 ↔ W3   (C3 01:30–06:15 — same corridor + possession times)
//
//   TMS-ENG-9001 ↔ J-02   Rail fracture weld repair            (C1,  90 min)
//   TMS-ENG-9002 ↔ J-04   Ballast cleaning (BCM)               (C2, 240 min)
//   TMS-ENG-9003 ↔ J-08   Track tamping (TCP)                  (C4, 240 min)
//   TMS-ENG-9004 ↔ J-11   Vegetation clearance                 (C3, 120 min)
//   TMS-ENG-9005 ↔ J-13   Motor trolley & packset patrol       (C1,  45 min)
//   TMS-ENG-9006 ↔ J-12   Cable route inspection               (C2,  90 min)
//   SMMS-SIG-501 ↔ J-03   Tundla panel interlocking recovery   (C2,  60 min)
//   SMMS-SIG-502 ↔ J-07   Axle counter renewal (EERC)          (C3, 180 min)
//   SMMS-SIG-503 ↔ J-09   Signal lamp replacement — batch      (C1,  60 min)
//   TDMS-OHE-771 ↔ J-01   OHE insulator replacement (shattered)(C5, 120 min)
//   TDMS-OHE-772 ↔ J-05   OHE auto-tension adjustment          (C3,  90 min)
//   TDMS-OHE-773 ↔ J-10   OHE mast pivot lubrication           (C1,  90 min)
//   BDMS-BR-B41  ↔ J-06   Girder bridge bearing inspection     (C3, 120 min)
//
// Backend-only rows without a seed counterpart (TDMS-OHE-774 feeder pillar,
// SMMS-SIG-504 point machine overhaul, BDMS-BR-B07 ROB joint check) resolve to
// `undefined` and are displayed under their canonical backend id — the UI never
// invents a local name for a job it does not have.
// ---------------------------------------------------------------------------

import { blockWindows, existingBlocks } from "./opsData";

/** Proposed COA blocks (backend register) that correspond to seed windows. */
const COA_PROPOSED: Record<string, { corridorId: string; start: string; end: string }> = {
  "BLK-2026-0432": { corridorId: "C1", start: "01:00", end: "04:00" },
  "BLK-2026-0431": { corridorId: "C3", start: "01:30", end: "06:15" },
};

/** Backend job id → seeded demo job id (see provenance table above). */
const SEED_JOB_OF_BACKEND: Record<string, string> = {
  "TMS-ENG-9001": "J-02",
  "TMS-ENG-9002": "J-04",
  "TMS-ENG-9003": "J-08",
  "TMS-ENG-9004": "J-11",
  "TMS-ENG-9005": "J-13",
  "TMS-ENG-9006": "J-12",
  "SMMS-SIG-501": "J-03",
  "SMMS-SIG-502": "J-07",
  "SMMS-SIG-503": "J-09",
  "TDMS-OHE-771": "J-01",
  "TDMS-OHE-772": "J-05",
  "TDMS-OHE-773": "J-10",
  "BDMS-BR-B41": "J-06",
};

const BACKEND_JOB_OF_SEED: Record<string, string> = Object.fromEntries(
  Object.entries(SEED_JOB_OF_BACKEND).map(([backendId, seedId]) => [seedId, backendId])
);

/** Backend canonical window/block id → seeded window id (W1…W3 / E1…E3). */
export function seedWindowOfBackendId(backendId: string): string | undefined {
  const id = String(backendId ?? "").trim();
  const sanctioned = existingBlocks.find((b) => b.blockId === id);
  if (sanctioned) return sanctioned.id;
  const proposed = COA_PROPOSED[id];
  if (proposed) {
    return blockWindows.find(
      (w) =>
        w.corridorId === proposed.corridorId && w.start === proposed.start && w.end === proposed.end
    )?.id;
  }
  return undefined;
}

/** Seeded window id → backend canonical window/block id (identity fallback). */
export function backendWindowOfSeedId(seedId: string): string {
  const id = String(seedId ?? "").trim();
  const sanctioned = existingBlocks.find((b) => b.id === id);
  if (sanctioned) return sanctioned.blockId;
  for (const [backendId, spec] of Object.entries(COA_PROPOSED)) {
    const match = blockWindows.find(
      (w) =>
        w.id === id &&
        w.corridorId === spec.corridorId &&
        w.start === spec.start &&
        w.end === spec.end
    );
    if (match) return backendId;
  }
  return id;
}

/** Backend canonical job id → seeded job id (undefined when backend-only). */
export function seedJobOfBackendId(backendId: string): string | undefined {
  return SEED_JOB_OF_BACKEND[String(backendId ?? "").trim()];
}

/** Seeded job id → backend canonical job id (identity fallback). */
export function backendJobOfSeedId(seedId: string): string {
  return BACKEND_JOB_OF_SEED[String(seedId ?? "").trim()] ?? String(seedId ?? "").trim();
}
