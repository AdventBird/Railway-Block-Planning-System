import { describe, it, expect } from "vitest";
import {
  minutesFromTimelineStart,
  calculateDurationMinutes,
  computeTimelineBarGeometry,
  TIMELINE_TOTAL_MINUTES,
} from "./timelineLayout";
import {
  deriveSectionsFromPath,
  getJobsForDate,
  FUTURE_BLOCKS,
  HORIZON_JOBS,
} from "../../data/horizonData";

describe("Timeline Layout Engine", () => {
  it("computes minutes from 22:00 horizon start across midnight correctly", () => {
    expect(minutesFromTimelineStart("22:00")).toBe(0);
    expect(minutesFromTimelineStart("23:00")).toBe(60);
    expect(minutesFromTimelineStart("00:00")).toBe(120);
    expect(minutesFromTimelineStart("01:00")).toBe(180);
    expect(minutesFromTimelineStart("04:00")).toBe(360);
    expect(minutesFromTimelineStart("08:00")).toBe(600);
  });

  it("calculates durations accurately across midnight", () => {
    expect(calculateDurationMinutes("22:50", "23:50")).toBe(60);
    expect(calculateDurationMinutes("23:30", "01:00")).toBe(90);
    expect(calculateDurationMinutes("01:00", "04:00")).toBe(180);
    expect(calculateDurationMinutes("01:30", "05:30")).toBe(240);
  });

  it("calculates bar geometry percentages strictly from domain times", () => {
    // W1: 01:00 to 04:00 inside a 600-minute horizon (22:00 to 08:00)
    // 01:00 is 180 min from 22:00 -> 180/600 = 30%
    // Duration is 180 min -> 180/600 = 30%
    const w1Geo = computeTimelineBarGeometry("01:00", "04:00", TIMELINE_TOTAL_MINUTES);
    expect(w1Geo.leftPercent).toBeCloseTo(30, 1);
    expect(w1Geo.widthPercent).toBeCloseTo(30, 1);

    // Train 12951: 22:50 to 23:50
    // 22:50 is 50 min from 22:00 -> 50/600 = 8.33%
    // Duration is 60 min -> 60/600 = 10%
    const trainGeo = computeTimelineBarGeometry("22:50", "23:50", TIMELINE_TOTAL_MINUTES);
    expect(trainGeo.leftPercent).toBeCloseTo(8.33, 1);
    expect(trainGeo.widthPercent).toBeCloseTo(10, 1);
  });
});

describe("Horizon Planning Selectors", () => {
  it("derives railway corridor sections from station sequence", () => {
    const sections = deriveSectionsFromPath(["NDLS", "GZB", "ALD", "CNB", "PRYJ"]);
    expect(sections.length).toBe(4);
    expect(sections[0].name).toBe("NDLS – GZB");
    expect(sections[0].lineType).toBe("DOUBLE");
    expect(sections[0].tracks.length).toBe(2);
    expect(sections[0].tracks[0].direction).toBe("UP");
    expect(sections[0].tracks[1].direction).toBe("DOWN");
  });

  it("filters jobs by planned date without assigning fake dates to deferred work", () => {
    const sep17Jobs = getJobsForDate("2026-09-17");
    expect(sep17Jobs.length).toBeGreaterThan(0);
    expect(sep17Jobs.every((j) => j.plannedDate === "2026-09-17")).toBe(true);

    // Verify deferred jobs have null plannedDate
    const deferredJobs = HORIZON_JOBS.filter((j) => j.status === "deferred" || j.status === "at_risk");
    expect(deferredJobs.length).toBeGreaterThan(0);
    expect(deferredJobs.some((j) => j.plannedDate === null)).toBe(true);
  });

  it("filters bundled jobs for container blocks on 17 Sep planning night", () => {
    const w1 = FUTURE_BLOCKS.find((b) => b.id === "W1");
    expect(w1).toBeDefined();
    expect(w1!.jobIds.length).toBe(3);
    expect(w1!.jobIds).toContain("J-02");
    expect(w1!.jobIds).toContain("J-09");
    expect(w1!.jobIds).toContain("J-13");
  });
});
