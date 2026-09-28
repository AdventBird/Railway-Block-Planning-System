import { describe, it, expect } from "vitest";
import { jobs, jobById, isJobOverdue, formatJobDeadline, totalPossessionMinutes } from "../data/jobsData";
import { deadlines } from "../data/planData";
import { blockWindows, existingBlocks } from "../data/opsData";
import { HORIZON_JOBS } from "../data/horizonData";
import { CANONICAL_PLANS, calculateSimulationResult } from "../data/simulationData";
import { parseTimeToMinutes } from "./planning/timelineLayout";

describe("Architecture & Data Model Consistency", () => {
  it("every job has a single authoritative ISO 8601 deadline", () => {
    jobs.forEach((job) => {
      expect(job.deadline).toBeDefined();
      // Must be valid date
      const timestamp = Date.parse(job.deadline);
      expect(Number.isNaN(timestamp)).toBe(false);

      // Any job in planData.deadlines must derive identically from jobsData
      const mapped = deadlines.find((d) => d.jobId === job.id);
      if (mapped) {
        expect(mapped.due).toBe(formatJobDeadline(job.deadline));
        expect(mapped.overdue).toBe(isJobOverdue(job.deadline));
      }
    });
  });

  it("HORIZON_JOBS J-01 through J-13 match authoritative job deadlines", () => {
    ["J-01", "J-02", "J-03", "J-04", "J-05", "J-06", "J-07", "J-08", "J-09", "J-10", "J-11", "J-12", "J-13"].forEach((id) => {
      const hJob = HORIZON_JOBS.find((j) => j.id === id);
      const authJob = jobById(id);
      expect(hJob).toBeDefined();
      expect(authJob).toBeDefined();
      expect(hJob!.deadline).toBe(authJob!.deadline);
    });
  });

  it("jobs and block windows have explicit sectionId, trackId, and direction", () => {
    jobs.forEach((job) => {
      expect(job.sectionId).toMatch(/^SEC-/);
      expect(job.trackId).toBeDefined();
      expect(["UP", "DOWN", "BOTH"]).toContain(job.direction);
    });

    blockWindows.forEach((win) => {
      expect(win.sectionId).toMatch(/^SEC-/);
      expect(win.trackId).toBeDefined();
      expect(["UP", "DOWN", "BOTH"]).toContain(win.direction);
    });

    existingBlocks.forEach((eb) => {
      expect(eb.sectionId).toMatch(/^SEC-/);
      expect(eb.trackId).toBeDefined();
      expect(["UP", "DOWN", "BOTH"]).toContain(eb.direction);
    });
  });

  it("differentiates setup, work, and restore durations", () => {
    const j1 = jobById("J-01");
    expect(j1).toBeDefined();
    expect(j1!.setupMinutes).toBe(20);
    expect(j1!.minutes).toBe(120);
    expect(j1!.restoreMinutes).toBe(15);
    expect(totalPossessionMinutes(j1!)).toBe(155);
  });

  it("computes duration with midnight crossing properly", () => {
    // 23:00 to 01:00 = 120 minutes
    const start2300 = parseTimeToMinutes("23:00");
    const end0100 = parseTimeToMinutes("01:00");
    const durationCrossing = (end0100 - start2300 + 1440) % 1440;
    expect(durationCrossing).toBe(120);

    // 01:30 to 03:00 = 90 minutes
    const start0130 = parseTimeToMinutes("01:30");
    const end0300 = parseTimeToMinutes("03:00");
    expect(end0300 - start0130).toBe(90);
  });

  it("CANONICAL_PLANS uses primary officer terminology instead of r3/r4", () => {
    const titles = CANONICAL_PLANS.map((p) => p.name);
    expect(titles.some((t) => t.includes("Current Plan"))).toBe(true);
    titles.forEach((title) => {
      expect(title.toLowerCase()).not.toContain("plan r3");
      expect(title.toLowerCase()).not.toContain("plan r4");
    });
  });

  it("simulation engine supports variable blocks (W1, W2, W3) without mutating inputs", () => {
    const resW1 = calculateSimulationResult("r3", "W1", "special_train", {
      direction: "UP",
      fromTo: "NDLS – GZB",
      timeStart: "02:30",
      timeEnd: "03:30",
      trainNumber: "00214",
    });
    expect(resW1.headline.toLowerCase()).toContain("special train");
    expect(resW1.before.blockLabel).toContain("W1");

    const resW2 = calculateSimulationResult("r3", "W2", "emergency_job", {
      direction: "DOWN",
      fromTo: "GZB – ALD",
      timeStart: "02:00",
      timeEnd: "03:00",
    });
    expect(resW2.before.blockLabel).toContain("W2");
    expect(resW2.whatChanged.length).toBeGreaterThan(0);

    const resW3 = calculateSimulationResult("r3", "W3", "reduce_window", {
      direction: "UP",
      fromTo: "ALD – CNB",
      newEndTime: "03:30",
    });
    expect(resW3.before.blockLabel).toContain("W3");
    expect(resW3.why.reasonCode).toBeDefined();
  });
});
