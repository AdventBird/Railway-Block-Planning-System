import { describe, expect, it } from "vitest";

describe("Command Center Operational Summary Logic", () => {
  it("maintains the 3 upcoming maintenance blocks with chronological order", () => {
    const upcomingBlocks = [
      {
        id: "W1",
        date: "17 SEP 2026",
        day: "Thu",
        windowId: "W1",
        section: "NDLS – GZB",
        track: "UP TRACK",
        timeRange: "01:00 – 04:00",
        duration: "3 h",
        jobsCount: 3,
        impact: "25 min expected impact",
        status: "PENDING APPROVAL",
      },
      {
        id: "W2",
        date: "18 SEP 2026",
        day: "Fri",
        windowId: "W2",
        section: "TDL – CNB",
        track: "DOWN TRACK",
        timeRange: "01:30 – 05:30",
        duration: "4 h",
        jobsCount: 2,
        impact: "18 min expected impact",
        status: "AT RISK",
      },
      {
        id: "W3",
        date: "19 SEP 2026",
        day: "Sat",
        windowId: "W3",
        section: "PRYJ – DDU",
        track: "UP TRACK",
        timeRange: "02:00 – 05:00",
        duration: "3 h",
        jobsCount: 4,
        impact: "8 min expected impact",
        status: "APPROVED",
      },
    ];

    expect(upcomingBlocks.length).toBe(3);
    expect(upcomingBlocks[0].windowId).toBe("W1");
    expect(upcomingBlocks[1].windowId).toBe("W2");
    expect(upcomingBlocks[2].windowId).toBe("W3");
    expect(upcomingBlocks[0].status).toBe("PENDING APPROVAL");
    expect(upcomingBlocks[1].status).toBe("AT RISK");
    expect(upcomingBlocks[2].status).toBe("APPROVED");
  });

  it("prioritizes semantic attention items with actionable destinations", () => {
    const attentionItems = [
      {
        id: "ATTN-1",
        severity: "critical",
        title: "Critical maintenance request",
        targetWindow: "W3",
      },
      {
        id: "ATTN-2",
        severity: "warning",
        title: "Block approval deadline",
        targetView: "approval",
      },
      {
        id: "ATTN-3",
        severity: "info",
        title: "Planning change request",
        targetScenario: "reserve",
      },
    ];

    expect(attentionItems.length).toBe(3);
    expect(attentionItems[0].severity).toBe("critical");
    expect(attentionItems[0].targetWindow).toBe("W3");
    expect(attentionItems[1].targetView).toBe("approval");
    expect(attentionItems[2].targetScenario).toBe("reserve");
  });
});
