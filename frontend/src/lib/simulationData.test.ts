import { describe, expect, it } from "vitest";
import {
  CANONICAL_PLANS,
  CANONICAL_SIM_BLOCKS,
  calculateSimulationResult,
} from "../data/simulationData";

describe("Simulation Multi-Block & Multi-Event What-If Sandbox", () => {
  it("provides canonical future plans and applicable blocks", () => {
    expect(CANONICAL_PLANS.length).toBeGreaterThanOrEqual(3);
    expect(CANONICAL_SIM_BLOCKS.length).toBeGreaterThanOrEqual(5);

    const blockIds = CANONICAL_SIM_BLOCKS.map((b) => b.id);
    expect(blockIds).toContain("W1");
    expect(blockIds).toContain("W2");
    expect(blockIds).toContain("W3");
    expect(blockIds).toContain("W4");
    expect(blockIds).toContain("W5");
  });

  it("simulates a special train on block W1 with TRAIN_CONFLICT and deferred job J-13", () => {
    const result = calculateSimulationResult("r3", "W1", "special_train", {
      direction: "UP",
      fromTo: "NDLS – GZB",
      timeStart: "02:30",
      timeEnd: "03:30",
      trainNumber: "00214",
    });

    expect(result.before.jobsCount).toBe(3);
    expect(result.after.scheduledCount).toBe(2);
    expect(result.after.deferredCount).toBe(1);
    expect(result.why.reasonCode).toBe("TRAIN_CONFLICT");
    expect(result.alternatives.length).toBe(3);

    // Verify whatChanged entries
    const changedJobIds = result.whatChanged.map((w) => w.jobId);
    expect(changedJobIds).toContain("J-02");
    expect(changedJobIds).toContain("J-09");
    expect(changedJobIds).toContain("J-13");

    const j13Change = result.whatChanged.find((w) => w.jobId === "J-13");
    expect(j13Change?.badgeText).toBe("Deferred");
    expect(j13Change?.badgeTone).toBe("red");
  });

  it("simulates a window reduction on block W2 (TDL-CNB DOWN)", () => {
    const result = calculateSimulationResult("r3", "W2", "reduce_window", {
      newEndTime: "04:30",
    });

    expect(result.before.blockLabel).toContain("W2");
    expect(result.before.section).toBe("TDL – CNB");
    expect(result.after.scheduledCount).toBe(1);
    expect(result.why.reasonCode).toBe("INSUFFICIENT_WINDOW");
    expect(result.alternatives.length).toBeGreaterThanOrEqual(2);
  });

  it("simulates block removal on block W3 (PRYJ-DDU UP)", () => {
    const result = calculateSimulationResult("r3", "W3", "remove_block", {});

    expect(result.before.blockLabel).toContain("W3");
    expect(result.before.jobsCount).toBe(4);
    expect(result.after.scheduledCount).toBe(0);
    expect(result.after.deferredCount).toBe(4);
    expect(result.why.reasonCode).toBe("ISOLATION_CONFLICT");
  });

  it("simulates emergency job insertion on block W1", () => {
    const result = calculateSimulationResult("r3", "W1", "emergency_job", {
      emergencyTitle: "EMG-01 · Rail fracture weld",
      emergencyDuration: 90,
    });

    expect(result.after.scheduledCount).toBe(1);
    expect(result.why.reasonCode).toBe("LOWER_PRIORITY");

    const emgItem = result.whatChanged.find((w) => w.jobId === "EMG-01");
    expect(emgItem).toBeDefined();
    expect(emgItem?.badgeText).toBe("Newly Scheduled");
  });

  it("simulates equipment breakdown on block W2", () => {
    const result = calculateSimulationResult("r3", "W2", "resource_unavailable", {
      unavailableResource: "BCM-0932 Ballast Cleaner",
    });

    expect(result.why.reasonCode).toBe("RESOURCE_CONFLICT");
    expect(result.after.deferredCount).toBe(1);
  });
});
