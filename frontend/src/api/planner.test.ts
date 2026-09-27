// ---------------------------------------------------------------------------
// Planner payload normalisation + canonical↔seed id bridge (§46).
// The fixtures mirror the REAL backend envelope of POST /api/planner/run.
// ---------------------------------------------------------------------------
import { describe, expect, it } from "vitest";
import {
  attemptedWindowOf,
  normalizeAssignments,
  OBJECTIVE_MODES,
  totalProposedWindowMinutes,
} from "./planner";
import { backendJobOfSeedId, seedJobOfBackendId, seedWindowOfBackendId } from "../data/idMap";
import { jobById } from "../data/jobsData";
import type { Job } from "../data/jobsData";

/** Assignment exactly as the CP-SAT backend emits it (snake + camel keys). */
const BACKEND_ASSIGNMENT = {
  jobId: "TDMS-OHE-771",
  job_id: "TDMS-OHE-771",
  windowId: "BLK-2026-0423",
  window_id: "BLK-2026-0423",
  start: "02:00",
  end: "04:35",
  start_minutes: 120,
  end_minutes: 275,
  parallel: false,
  possession_minutes: 155,
  note: "Scheduled in BLK-2026-0423 (C5)",
  resources: ["tower wagon tw-925", "ohe crew a"],
  tier: 0,
  tierReason: "Tier 0 (Emergency) — safety consequence immediate halt",
  title: "OHE insulator replacement (shattered)",
  department: "TRD",
  corridorId: "C5",
  minutes: 120,
};

describe("normalizeAssignments — real backend payload", () => {
  it("maps backend context fields onto the UI shape", () => {
    const rows = normalizeAssignments([BACKEND_ASSIGNMENT]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.jobId).toBe("TDMS-OHE-771");
    expect(row.startMinutes).toBe(120);
    expect(row.possessionMinutes).toBe(155);
    expect(row.tier).toBe(0);
    expect(row.tierReason).toContain("Tier 0");
    expect(row.title).toBe("OHE insulator replacement (shattered)");
    expect(row.department).toBe("TRD");
    expect(row.corridorId).toBe("C5");
    expect(row.minutes).toBe(120);
  });

  it("drops unplaceable rows (missing window or interval)", () => {
    const rows = normalizeAssignments([
      { jobId: "X", start: "01:00", end: "02:00" }, // no window
      { jobId: "Y", windowId: "W1" }, // no interval
      BACKEND_ASSIGNMENT,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].jobId).toBe("TDMS-OHE-771");
  });

  it("tolerates a non-array payload", () => {
    expect(normalizeAssignments(undefined)).toEqual([]);
    expect(normalizeAssignments({})).toEqual([]);
  });
});

describe("objective modes (Feature 18)", () => {
  it("exposes the three backend weight profiles", () => {
    expect(OBJECTIVE_MODES).toEqual(["SAFETY_FIRST", "BALANCED", "PUNCTUALITY_FIRST"]);
  });
});

describe("id bridge — canonical ↔ seed (one documented correspondence)", () => {
  it("maps backend job ids to seed ids and back", () => {
    expect(seedJobOfBackendId("TMS-ENG-9001")).toBe("J-02");
    expect(backendJobOfSeedId("J-02")).toBe("TMS-ENG-9001");
    expect(seedJobOfBackendId("TMS-ENG-9001")).toBeTruthy();
  });

  it("leaves backend-only ids untouched (never invents a seed row)", () => {
    expect(seedJobOfBackendId("TDMS-OHE-774")).toBeUndefined();
    expect(backendJobOfSeedId("TDMS-OHE-774")).toBe("TDMS-OHE-774");
  });

  it("maps sanctioned COA block ids to seeded windows", () => {
    expect(seedWindowOfBackendId("BLK-2026-0423")).toBe("E3");
    expect(seedWindowOfBackendId("BLK-2026-0432")).toBe("W1");
  });

  it("seed lookup resolves through the bridge for tier display", () => {
    const seedId = seedJobOfBackendId("TMS-ENG-9001");
    const job: Job | undefined = seedId ? jobById(seedId) : undefined;
    expect(job?.tier).toBeTypeOf("number");
    expect(job?.dept).toBe("Engineering");
  });
});

describe("plan helpers", () => {
  it("totals proposed window minutes from the seed register", () => {
    expect(totalProposedWindowMinutes()).toBeGreaterThan(0);
  });

  it("finds the attempted window for a deferred job", () => {
    const weld = jobById("J-02");
    expect(attemptedWindowOf(weld, [])).toBeTruthy();
    expect(attemptedWindowOf(undefined, [])).toBeNull();
  });
});
