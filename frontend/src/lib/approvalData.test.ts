import { describe, it, expect } from "vitest";
import {
  PROPOSED_BLOCKS,
  ISSUES_TO_REVIEW,
  SYSTEM_ALTERNATIVES,
  HUMAN_PLAN_HISTORY,
  type DraftChange,
} from "./approvalData";

describe("Approval & History Domain Data and Business Rules", () => {
  describe("Proposed Blocks & Bundled Maintenance Jobs", () => {
    it("provides the 3 canonical proposed blocks with proper railway attributes", () => {
      expect(PROPOSED_BLOCKS.length).toBe(3);
      const [w1, w2, w3] = PROPOSED_BLOCKS;

      // W1 checks
      expect(w1.id).toBe("W1");
      expect(w1.section).toBe("NDLS–GZB");
      expect(w1.track).toBe("UP TRACK");
      expect(w1.direction).toBe("UP");
      expect(w1.timeWindow).toBe("01:00–04:00");
      expect(w1.durationMinutes).toBe(180);
      expect(w1.status).toBe("Pending Approval");

      // W2 checks
      expect(w2.id).toBe("W2");
      expect(w2.section).toBe("TDL–CNB");
      expect(w2.track).toBe("DOWN TRACK");
      expect(w2.direction).toBe("DOWN");
      expect(w2.timeWindow).toBe("01:30–05:30");
      expect(w2.durationMinutes).toBe(240);

      // W3 checks
      expect(w3.id).toBe("W3");
      expect(w3.section).toBe("PRYJ–DDU");
      expect(w3.track).toBe("UP TRACK");
      expect(w3.direction).toBe("UP");
      expect(w3.timeWindow).toBe("02:00–05:00");
      expect(w3.durationMinutes).toBe(180);
    });

    it("verifies bundled jobs inside each proposed block without timeline clutter", () => {
      const [w1, w2, w3] = PROPOSED_BLOCKS;

      // W1 has 3 jobs: J-02 (Engg), J-09 (S&T), J-13 (Engg)
      expect(w1.bundledJobs.length).toBe(3);
      expect(w1.bundledJobs.map((j) => j.id)).toEqual(["J-02", "J-09", "J-13"]);
      expect(w1.bundledJobs[0].dept).toBe("Engineering");
      expect(w1.bundledJobs[1].dept).toBe("S&T");
      expect(w1.bundledJobs[2].dept).toBe("Engineering");

      // W2 has 2 jobs: J-04 (Engg), J-12 (S&T)
      expect(w2.bundledJobs.length).toBe(2);
      expect(w2.bundledJobs.map((j) => j.id)).toEqual(["J-04", "J-12"]);

      // W3 has 2 jobs: J-05 (TRD), J-07 (S&T)
      expect(w3.bundledJobs.length).toBe(2);
      expect(w3.bundledJobs.map((j) => j.id)).toEqual(["J-05", "J-07"]);
    });

    it("provides system-backed 'Why grouped?' compatibility rationale for all blocks", () => {
      for (const block of PROPOSED_BLOCKS) {
        expect(block.whyGrouped.summary).toBeTruthy();
        expect(block.whyGrouped.points.length).toBeGreaterThanOrEqual(3);
        expect(block.whyGrouped.trafficSafety).toBeTruthy();

        // Rationale must touch work methods, isolation, and resources
        const combined = block.whyGrouped.points.join(" ").toLowerCase();
        expect(combined).toMatch(/compatible|work methods|parallel/);
        expect(combined).toMatch(/isolation|possession|traffic/);
      }
    });
  });

  describe("Issues to Review (Exceptions requiring officer attention)", () => {
    it("lists key deferred and conflict issues with reasons and next feasible dates", () => {
      expect(ISSUES_TO_REVIEW.length).toBeGreaterThanOrEqual(3);

      const j05Issue = ISSUES_TO_REVIEW.find((i) => i.jobId === "J-05");
      expect(j05Issue).toBeDefined();
      expect(j05Issue?.status).toBe("Deferred");
      expect(j05Issue?.reason).toBe("Train conflict");
      expect(j05Issue?.nextFeasible).toBe("23 Sep");

      const j06Issue = ISSUES_TO_REVIEW.find((i) => i.jobId === "J-06");
      expect(j06Issue).toBeDefined();
      expect(j06Issue?.status).toBe("Deferred");
      expect(j06Issue?.reason).toBe("Resource conflict");
      expect(j06Issue?.nextFeasible).toBe("24 Sep");

      const j10Issue = ISSUES_TO_REVIEW.find((i) => i.jobId === "J-10");
      expect(j10Issue).toBeDefined();
      expect(j10Issue?.reason).toBe("Resource conflict");
    });
  });

  describe("System Alternatives & Decision Support Logic", () => {
    it("contains alternatives for blocks with operational consequences", () => {
      const w1Alts = SYSTEM_ALTERNATIVES["W1"];
      expect(w1Alts).toBeDefined();
      expect(w1Alts.length).toBeGreaterThanOrEqual(3);

      // Check feasible option
      const feasible = w1Alts.find((a) => a.feasibilityTag === "Feasible");
      expect(feasible).toBeDefined();
      expect(feasible?.expectedTrainImpactMinutes).toBeGreaterThan(0);

      // Check infeasible option
      const infeasible = w1Alts.find((a) => a.feasibilityTag === "Infeasible");
      expect(infeasible).toBeDefined();
      expect(infeasible?.feasible).toBe(false);
      expect(infeasible?.infeasibleReason).toContain("Insufficient duration");
    });

    it("contains alternatives for deferred jobs with positive scheduled delta", () => {
      const j05Alts = SYSTEM_ALTERNATIVES["J-05"];
      expect(j05Alts).toBeDefined();

      const feasible = j05Alts.find((a) => a.feasible);
      expect(feasible).toBeDefined();
      expect(feasible?.scheduledDelta).toBe(1);
      expect(feasible?.deferredDelta).toBe(-1);
    });
  });

  describe("Draft Change Formulation", () => {
    it("accumulates and formats draft changes cleanly for submission", () => {
      const sampleDraft: DraftChange[] = [
        {
          id: "CHG-1",
          targetType: "job",
          targetId: "J-05",
          targetTitle: "J-05 · OHE auto-tension adjustment",
          previousAllocation: "Deferred",
          newAllocation: "W2 · 23 Sep (04:10–05:30)",
          expectedTrainImpactChange: "+8 min expected train impact",
          jobsCountChange: "+1 scheduled",
          timestamp: "18:40",
        },
      ];

      expect(sampleDraft.length).toBe(1);
      const summary = sampleDraft
        .map((c) => `${c.targetTitle}: ${c.previousAllocation} → ${c.newAllocation}`)
        .join("; ");

      expect(summary).toContain("J-05 · OHE auto-tension adjustment");
      expect(summary).toContain("Deferred → W2 · 23 Sep");
    });
  });

  describe("Human-Readable Plan History (Anti-r1/r2/r3 rule)", () => {
    it("strictly avoids prominent r1/r2/r3 labels as primary title", () => {
      expect(HUMAN_PLAN_HISTORY.length).toBeGreaterThanOrEqual(3);

      for (const item of HUMAN_PLAN_HISTORY) {
        expect(item.title).toMatch(/Plan Revision$/);
        expect(item.title).not.toMatch(/^r\d/i);
        expect(item.date).toBeTruthy();
        expect(item.officer).toBeTruthy();
        expect(item.reason).toBeTruthy();
      }
    });
  });
});
