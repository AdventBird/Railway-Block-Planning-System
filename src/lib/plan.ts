// ---------------------------------------------------------------------------
// Derived planning arithmetic — every count, duration and utilization number
// shown in the UI is computed here from the underlying mock data (never
// hand-maintained), so all screens stay consistent by construction.
// ---------------------------------------------------------------------------

export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Minutes inside [start, end) treating times as a circular 24 h clock. */
export const spanMinutes = (start: string, end: string): number =>
  (((toMin(end) - toMin(start)) % 1440) + 1440) % 1440;

export const fmtClock = (m: number): string =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export interface Interval {
  start: string;
  end: string;
}

/** Union of intervals on one window, in minutes (overlaps counted once). */
export function occupiedUnion(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = intervals
    .map((i) => ({ s: toMin(i.start), e: toMin(i.end) }))
    .sort((a, b) => a.s - b.s);
  let total = 0;
  let curS = sorted[0].s;
  let curE = sorted[0].e;
  for (const iv of sorted.slice(1)) {
    if (iv.s <= curE) {
      curE = Math.max(curE, iv.e);
    } else {
      total += curE - curS;
      curS = iv.s;
      curE = iv.e;
    }
  }
  return total + (curE - curS);
}

export interface PlanWindow {
  id: string;
  minutes: number;
}

export interface PlanSched {
  windowId: string;
  start: string;
  end: string;
  parallel?: boolean;
}

export interface PlanStats {
  blocks: number;
  jobs: number;
  windowMinutes: number;
  occupiedMinutes: number;
  unusedMinutes: number;
  utilization: number;
}

/**
 * Plan-level stats. "Blocks" counts the proposed windows in use; utilization
 * is occupied union minutes ÷ total proposed window minutes.
 */
export function planStats(
  windows: PlanWindow[],
  sched: PlanSched[]
): PlanStats {
  const windowMinutes = windows.reduce((a, w) => a + w.minutes, 0);
  const usedWindows = windows.filter((w) => sched.some((s) => s.windowId === w.id));
  const occupiedMinutes = usedWindows.reduce(
    (a, w) => a + occupiedUnion(sched.filter((s) => s.windowId === w.id)),
    0
  );
  return {
    blocks: usedWindows.length,
    jobs: sched.length,
    windowMinutes,
    occupiedMinutes,
    unusedMinutes: windowMinutes - occupiedMinutes,
    utilization: windowMinutes ? Math.round((occupiedMinutes / windowMinutes) * 100) : 0,
  };
}