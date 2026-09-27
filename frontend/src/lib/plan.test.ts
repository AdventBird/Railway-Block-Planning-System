// ---------------------------------------------------------------------------
// Time arithmetic (Part 7) — every duration must survive the circular 24 h
// clock. The demo horizon is 22:00 → 08:00, so midnight crossing is the norm.
// ---------------------------------------------------------------------------
import { describe, expect, it } from "vitest";
import { occupiedUnion, planStats, spanMinutes, toMin } from "./plan";

describe("spanMinutes — circular 24 h clock", () => {
  it.each([
    ["23:00", "01:00", 120], // crosses midnight
    ["01:30", "03:00", 90],
    ["23:45", "00:30", 45], // crosses midnight
    ["00:30", "00:30", 0],
    ["22:00", "08:00", 600], // full planning horizon
    ["12:00", "13:00", 60], // ordinary daytime interval
  ])("%s → %s is %i minutes", (start, end, expected) => {
    expect(spanMinutes(start, end)).toBe(expected);
  });

  it("never returns a negative duration", () => {
    for (const [s, e] of [
      ["23:59", "00:01"],
      ["07:55", "07:00"],
      ["01:00", "00:30"],
    ]) {
      expect(spanMinutes(s, e)).toBeGreaterThanOrEqual(0);
    }
  });

  it("toMin matches HH:MM arithmetic", () => {
    expect(toMin("00:00")).toBe(0);
    expect(toMin("23:59")).toBe(23 * 60 + 59);
  });
});

describe("occupiedUnion — interval union per window", () => {
  it("counts overlapping intervals once", () => {
    expect(
      occupiedUnion([
        { start: "01:00", end: "02:00" },
        { start: "01:30", end: "02:30" },
      ])
    ).toBe(90);
  });

  it("handles empty input and disjoint intervals", () => {
    expect(occupiedUnion([])).toBe(0);
    expect(
      occupiedUnion([
        { start: "01:00", end: "01:30" },
        { start: "02:00", end: "02:30" },
      ])
    ).toBe(60);
  });

  it("merges cross-midnight intervals laid out on the circular clock", () => {
    // 23:30→00:30 and 00:00→00:45 overlap on the continuous timeline only
    // when both start after 22:00 — the horizon normalization applies.
    expect(
      occupiedUnion([
        { start: "00:00", end: "00:45" },
        { start: "00:30", end: "01:00" },
      ])
    ).toBe(60);
  });
});

describe("planStats — derived dashboard arithmetic", () => {
  it("never divides by zero on an empty window set", () => {
    const stats = planStats([], [{ windowId: "W1", start: "01:00", end: "02:00" }]);
    expect(stats.utilization).toBe(0);
    expect(Number.isFinite(stats.utilization)).toBe(true);
  });

  it("computes utilization from actual assignments", () => {
    const stats = planStats(
      [{ id: "W1", minutes: 120 }],
      [{ windowId: "W1", start: "01:00", end: "02:00" }]
    );
    expect(stats.blocks).toBe(1);
    expect(stats.jobs).toBe(1);
    expect(stats.occupiedMinutes).toBe(60);
    expect(stats.unusedMinutes).toBe(60);
    expect(stats.utilization).toBe(50);
  });

  it("ignores assignments on windows that are not proposed", () => {
    const stats = planStats(
      [{ id: "W1", minutes: 120 }],
      [{ windowId: "GHOST", start: "01:00", end: "02:00" }]
    );
    expect(stats.blocks).toBe(0);
    expect(stats.jobs).toBe(1);
    expect(stats.occupiedMinutes).toBe(0);
  });
});
