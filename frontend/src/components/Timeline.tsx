// ---------------------------------------------------------------------------
// Shared railway timeline (22:00 → 08:00 corridor lanes).
// Full mode  = Planning Workspace center zone (windows, trains, blocks, jobs).
// Compact    = Command Center "Tonight's plan" strip (windows, trains, blocks).
// ---------------------------------------------------------------------------
import type { CSSProperties } from "react";
import { blockWindows, corridors, existingBlocks, trains } from "../data/opsData";
import { jobById } from "../data/jobsData";
import { seedJobOfBackendId, seedWindowOfBackendId } from "../data/idMap";
import { recommendedPlan } from "../data/planData";
import { spanMinutes } from "../lib/plan";
import type { PlannerAssignment } from "../api/types";

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
  row?: number; // job bars: stagger track (0/1) so concurrent work never overlaps
}

export interface TimelineLane {
  id: string;
  label: string;
  line: string;
  bars: TimelineBar[];
  /** Job tracks used in this lane (0–4) — drives the data-driven lane height. */
  jobTracks: number;
}

/**
 * Corridor owning a window id — resolved without guesswork:
 *   1. seeded proposed window (W1…W3) or sanctioned block (E1…E3);
 *   2. a backend canonical block id (`BLK-2026-…`) via the documented id map;
 *   3. the assignment's own enriched corridor id (backend-enriched rows).
 * Returns `undefined` when unresolvable — such job bars are simply not drawn.
 */
export function corridorOfWindowId(
  windowId: string,
  assignment?: PlannerAssignment
): string | undefined {
  const id = String(windowId ?? "").trim();
  const proposed = blockWindows.find((w) => w.id === id);
  if (proposed) return proposed.corridorId;
  const sanctioned = existingBlocks.find((b) => b.id === id || b.blockId === id);
  if (sanctioned) return sanctioned.corridorId;
  const seedId = seedWindowOfBackendId(id);
  if (seedId) {
    const seedWin =
      blockWindows.find((w) => w.id === seedId) ?? existingBlocks.find((b) => b.id === seedId);
    if (seedWin) return seedWin.corridorId;
  }
  return assignment?.corridorId;
}

const startPct = (t: string): number => (((spanMinutes("22:00", t)) / SPAN) * 100);
const widthPct = (s: string, e: string): number => (spanMinutes(s, e) / SPAN) * 100;

/**
 * Full planning-night lanes: windows + trains + existing blocks + plan jobs.
 * `assignments` defaults to the seeded plan; callers pass the live planner
 * result so the timeline always mirrors what the backend actually scheduled.
 */
export function buildPlanLanes(
  assignments: PlannerAssignment[] = recommendedPlan.assignments
): TimelineLane[] {
  const jobCount: Record<string, number> = {};
  assignments.forEach((a) => {
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
    // Concurrent jobs stagger onto up to four vertical tracks — a fully bundled
    // window (4 parallel jobs, Feature 13) still reads without label collisions.
    const jobTracks = pushJobBars(assignments, c.id, bars);
    return { id: c.id, label: c.label, line: c.line, bars, jobTracks };
  });
}

/**
 * Push plan jobs for one corridor onto up to four staggered vertical tracks.
 * Returns how many tracks were used (0–4) so lanes can size themselves.
 */
function pushJobBars(assignments: PlannerAssignment[], corridorId: string, bars: TimelineBar[]): number {
  const tracks: { s: number; e: number }[][] = [[], [], [], []];
  assignments.forEach((a) => {
    if (corridorOfWindowId(a.windowId, a) !== corridorId) return;
    // Works for raw backend ids (Command Center) and seed-enriched ids (Workspace).
    const job = jobById(a.jobId) ?? jobById(seedJobOfBackendId(a.jobId) ?? a.jobId);
    const s = spanMinutes("22:00", a.start);
    const rawE = spanMinutes("22:00", a.end);
    const e = rawE < s ? rawE + SPAN : rawE;
    let row = tracks.findIndex((track) => track.every((iv) => e <= iv.s || s >= iv.e));
    if (row === -1) row = 0; // >4 concurrent — degrade to track 0 rather than hiding
    tracks[row].push({ s, e });
    bars.push({
      key: `job-${a.jobId}`,
      kind: "job",
      label: job ? `${a.jobId} ${job.title.split(/[—(]/)[0].trim()}` : a.jobId,
      sub: a.parallel ? "parallel" : undefined,
      start: a.start,
      end: a.end,
      winId: a.windowId,
      row,
    });
  });
  return tracks.reduce((used, track, i) => (track.length > 0 ? i + 1 : used), 0);
}

/**
 * Summary lanes for the Command Center. Accepts live planner assignments so
 * "Tonight's plan" shows the actual scheduled work, not just the windows.
 */
export function buildSummaryLanes(assignments: PlannerAssignment[] = []): TimelineLane[] {
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
    const jobTracks = pushJobBars(assignments, c.id, bars);
    return { id: c.id, label: c.label, line: c.line, bars, jobTracks };
  });
}

/* ------------------------------- rendering -------------------------------- */

const BAR_STYLE: Record<BarKind, { base: string; style?: CSSProperties; text?: string; lead?: string }> = {
  // BACKGROUND role — quiet dashed capacity strip behind everything.
  window: {
    base: "inset-y-2 border border-dashed border-[#2e3092]/35 bg-[#eef0fa]/60 text-[#2e3092]/60",
  },
  // PRIMARY role — scheduled maintenance is the dominant object (tracks set in Bar).
  job: {
    base: "bg-[#2e3092] text-white",
    text: "text-[10px]",
    lead: "leading-[13px]",
  },
  // SECONDARY role — train movements read as outlines, never solid.
  passenger: {
    base: "top-1 h-5 text-[#166534]",
    style: { background: "rgba(22,163,74,0.14)", border: "1px solid rgba(22,163,74,0.65)" },
    text: "text-[9px]",
  },
  freight: {
    base: "top-1 h-5 text-[#4d5468]",
    style: { background: "rgba(100,116,139,0.16)", border: "1px solid rgba(100,116,139,0.6)" },
    text: "text-[9px]",
  },
  // EXCEPTION role — protected/special movements stay unmistakable.
  special: {
    base: "top-1 h-5 text-white",
    style: { background: "#dc2626" },
    text: "text-[9px]",
  },
  // SUBTLE role — sanctioned blocks sit quietly on their own slim band.
  "block-approved": {
    base: "top-[25px] h-[9px] text-[#94a3b8]",
    style: { background: "rgba(148,163,184,0.22)", border: "1px solid rgba(100,116,139,0.35)" },
    text: "text-[8px]",
    lead: "leading-[9px]",
  },
  "block-pending": {
    base: "top-[25px] h-[9px] text-[#b45309]",
    style: { background: "rgba(217,119,6,0.14)", border: "1px solid rgba(217,119,6,0.5)" },
    text: "text-[8px]",
    lead: "leading-[9px]",
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
  if (b.kind === "job") {
    // Up to four staggered tracks below trains/blocks (lane is 92px tall).
    style.top = 35 + Math.min(b.row ?? 0, 3) * 14;
    style.height = 13;
  }
  const clickable = Boolean(b.winId || b.trainId);
  return (
    <button
      type="button"
      onClick={() => clickable && onPick(b)}
      title={`${b.label}${b.sub ? ` · ${b.sub}` : ""}`}
      className={`absolute overflow-hidden whitespace-nowrap rounded px-1.5 text-left font-bold transition-[filter] duration-150 ${
        meta.text ?? (compact ? "text-[8px]" : "text-[9px]")
      } ${meta.lead ?? "leading-5"} ${meta.base} ${clickable ? "cursor-pointer hover:z-10 hover:brightness-110" : "cursor-default"}`}
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

      {/* Corridor lanes — height is data-driven: 36px for trains/bands,
          +14px per job track actually used (0–4). */}
      {lanes.map((lane) => {
        const laneH = compact ? 36 : 35 + Math.min(lane.jobTracks ?? 0, 4) * 14 + 1;
        return (
        <div key={lane.id} className="mb-1.5 flex items-stretch">
          <div className={`${labelWidth} shrink-0 pr-3 text-right`}>
            <div className={`truncate font-bold text-[#171a30] ${compact ? "text-[10px]" : "text-[11px]"}`}>
              {lane.label}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-[#878da1]">{lane.line} line</div>
          </div>
          <div
            className="relative flex-1 rounded-lg border border-[#e3e6f0] bg-[#fafbfd]"
            style={{ height: laneH }}
          >
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
        );
      })}
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