// ---------------------------------------------------------------------------
// Shared railway timeline (22:00 → 08:00 corridor lanes).
// Full mode  = Planning Workspace center zone (windows, trains, blocks, jobs).
// Compact    = Command Center "Tonight's plan" strip (windows, trains, blocks).
// ---------------------------------------------------------------------------
import type { CSSProperties } from "react";
import { blockWindows, corridors, existingBlocks, trains } from "../data/opsData";
import { jobById } from "../data/jobsData";
import { recommendedPlan } from "../data/planData";
import { spanMinutes } from "../lib/plan";

const SPAN = 10 * 60; // 22:00 → 08:00
export const HOURS = Array.from({ length: 11 }, (_, i) => `${String((22 + i) % 24).padStart(2, "0")}:00`);

export type BarKind =
  | "window"
  | "passenger"
  | "freight"
  | "special"
  | "block-approved"
  | "block-pending"
  | "job";

export interface TimelineBar {
  key: string;
  kind: BarKind;
  label: string;
  sub?: string;
  start: string;
  end: string;
  winId?: string; // set for window / block / job bars → opens the window drawer
  trainId?: string; // set for train bars → opens the train drawer
}

export interface TimelineLane {
  id: string;
  label: string;
  line: string;
  bars: TimelineBar[];
}

const CORRIDOR_OF_WINDOW: Record<string, string> = { W1: "C1", W2: "C2", W3: "C3", E1: "C4", E2: "C2", E3: "C5" };

const startPct = (t: string): number => (((spanMinutes("22:00", t)) / SPAN) * 100);
const widthPct = (s: string, e: string): number => (spanMinutes(s, e) / SPAN) * 100;

/** Full planning-night lanes: windows + trains + existing blocks + plan jobs. */
export function buildPlanLanes(): TimelineLane[] {
  const jobCount: Record<string, number> = {};
  recommendedPlan.assignments.forEach((a) => {
    jobCount[a.windowId] = (jobCount[a.windowId] ?? 0) + 1;
  });

  return corridors.map((c) => {
    const bars: TimelineBar[] = [];
    blockWindows
      .filter((w) => w.corridorId === c.id)
      .forEach((w) =>
        bars.push({
          key: w.id,
          kind: "window",
          label: `${w.id} · ${w.start}–${w.end}`,
          sub: `${jobCount[w.id] ?? 0} jobs`,
          start: w.start,
          end: w.end,
          winId: w.id,
        })
      );
    trains
      .filter((t) => t.corridorId === c.id)
      .forEach((t) =>
        bars.push({
          key: t.id,
          kind: t.type === "special" ? "special" : t.type === "passenger" ? "passenger" : "freight",
          label: `${t.number} ${t.name}`,
          start: t.start,
          end: t.end,
          trainId: t.id,
        })
      );
    existingBlocks
      .filter((b) => b.corridorId === c.id)
      .forEach((b) =>
        bars.push({
          key: b.id,
          kind: b.status === "approved" ? "block-approved" : "block-pending",
          label: b.blockId,
          sub: b.work.split("(")[0].trim(),
          start: b.start,
          end: b.end,
          winId: b.id,
        })
      );
    recommendedPlan.assignments.forEach((a) => {
      if (CORRIDOR_OF_WINDOW[a.windowId] !== c.id) return;
      const job = jobById(a.jobId);
      bars.push({
        key: `job-${a.jobId}`,
        kind: "job",
        label: `${a.jobId} ${job?.title.split(/[—(]/)[0].trim() ?? ""}`,
        sub: a.parallel ? "parallel" : undefined,
        start: a.start,
        end: a.end,
        winId: a.windowId,
      });
    });
    return { id: c.id, label: c.label, line: c.line, bars };
  });
}

/** Compact lanes for the Command Center: windows + trains + existing blocks. */
export function buildSummaryLanes(): TimelineLane[] {
  return corridors.map((c) => {
    const bars: TimelineBar[] = [];
    blockWindows
      .filter((w) => w.corridorId === c.id)
      .forEach((w) =>
        bars.push({
          key: w.id,
          kind: "window",
          label: `${w.id} · ${w.start}–${w.end}`,
          sub: `${w.minutes} min`,
          start: w.start,
          end: w.end,
          winId: w.id,
        })
      );
    trains
      .filter((t) => t.corridorId === c.id)
      .forEach((t) =>
        bars.push({
          key: t.id,
          kind: t.type === "special" ? "special" : t.type === "passenger" ? "passenger" : "freight",
          label: `${t.number}`,
          start: t.start,
          end: t.end,
          trainId: t.id,
        })
      );
    existingBlocks
      .filter((b) => b.corridorId === c.id)
      .forEach((b) =>
        bars.push({
          key: b.id,
          kind: b.status === "approved" ? "block-approved" : "block-pending",
          label: b.blockId,
          start: b.start,
          end: b.end,
          winId: b.id,
        })
      );
    return { id: c.id, label: c.label, line: c.line, bars };
  });
}

/* ------------------------------- rendering -------------------------------- */

const BAR_STYLE: Record<BarKind, { base: string; style?: CSSProperties }> = {
  window: {
    base: "inset-y-1.5 border border-dashed border-[#2e3092]/70 bg-[#eef0fa] text-[#2e3092]",
  },
  job: {
    base: "top-7 bottom-1.5 bg-[#2e3092] text-white",
  },
  passenger: {
    base: "top-1 h-5 text-[#166534]",
    style: { background: "rgba(22,163,74,0.14)", border: "1px solid rgba(22,163,74,0.65)" },
  },
  freight: {
    base: "top-1 h-5 text-[#4d5468]",
    style: { background: "rgba(100,116,139,0.16)", border: "1px solid rgba(100,116,139,0.6)" },
  },
  special: {
    base: "top-1 h-5 text-white",
    style: { background: "#dc2626" },
  },
  "block-approved": {
    base: "bottom-1.5 h-5 text-[#4d5468]",
    style: { background: "rgba(148,163,184,0.28)", border: "1px solid rgba(100,116,139,0.55)" },
  },
  "block-pending": {
    base: "bottom-1.5 h-5 text-[#b45309]",
    style: { background: "rgba(217,119,6,0.18)", border: "1px solid rgba(217,119,6,0.6)" },
  },
};

function Bar({
  b,
  compact,
  onPick,
}: {
  b: TimelineBar;
  compact?: boolean;
  onPick: (b: TimelineBar) => void;
}) {
  const style: CSSProperties = { left: `${startPct(b.start)}%`, width: `${widthPct(b.start, b.end)}%` };
  const meta = BAR_STYLE[b.kind];
  if (meta.style) Object.assign(style, meta.style);
  const clickable = Boolean(b.winId || b.trainId);
  return (
    <button
      type="button"
      onClick={() => clickable && onPick(b)}
      title={`${b.label}${b.sub ? ` · ${b.sub}` : ""}`}
      className={`absolute overflow-hidden whitespace-nowrap rounded px-1.5 text-left font-bold leading-5 transition-[filter] duration-150 ${
        compact ? "text-[8px]" : "text-[9px]"
      } ${meta.base} ${clickable ? "cursor-pointer hover:z-10 hover:brightness-110" : "cursor-default"}`}
      style={style}
    >
      {b.label}
      {b.sub ? ` · ${b.sub}` : ""}
    </button>
  );
}

export function Timeline({
  lanes,
  compact,
  onPick,
}: {
  lanes: TimelineLane[];
  compact?: boolean;
  onPick: (b: TimelineBar) => void;
}) {
  const laneHeight = compact ? "h-9" : "h-[64px]";
  const labelWidth = compact ? "w-28" : "w-32";
  return (
    <div>
      {/* Hour ruler */}
      <div className="mb-1 flex">
        <div className={`${labelWidth} shrink-0`} />
        <div className="relative h-4 flex-1">
          {HOURS.map((h, i) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 font-mono text-[9px] text-[#a2a7ba]"
              style={{ left: `${(i / 10) * 100}%` }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>

      {/* Corridor lanes */}
      {lanes.map((lane) => (
        <div key={lane.id} className="mb-1.5 flex items-stretch">
          <div className={`${labelWidth} shrink-0 pr-3 text-right`}>
            <div className={`truncate font-bold text-[#171a30] ${compact ? "text-[10px]" : "text-[11px]"}`}>
              {lane.label}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-[#878da1]">{lane.line} line</div>
          </div>
          <div className={`relative flex-1 rounded-lg border border-[#e3e6f0] bg-[#fafbfd] ${laneHeight}`}>
            {HOURS.map((_, i) => (
              <div
                key={i}
                className="absolute inset-y-0 w-px bg-[#eef0f6]"
                style={{ left: `${(i / 10) * 100}%` }}
              />
            ))}
            {lane.bars.map((b) => (
              <Bar key={b.key} b={b} compact={compact} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact legend row shared by both timeline users. */
export function TimelineLegend() {
  const items: [string, string][] = [
    ["Maintenance window", "border border-dashed border-[#2e3092]/70 bg-[#eef0fa]"],
    ["Planned work", "bg-[#2e3092]"],
    ["Passenger", "border border-[#16a34a]/60 bg-[#16a34a]/15"],
    ["Freight", "border border-[#64748b]/60 bg-[#64748b]/15"],
    ["Special / secure", "bg-[#dc2626]"],
    ["Sanctioned block", "border border-[#64748b]/60 bg-[#94a3b8]/30"],
  ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
      {items.map(([label, cls]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`h-2 w-4 rounded-sm ${cls}`} /> {label}
        </span>
      ))}
    </div>
  );
}