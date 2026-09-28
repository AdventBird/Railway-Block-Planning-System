// ---------------------------------------------------------------------------
// Mathematical Timeline Layout Engine
// Strictly computes event positioning and dimensions from domain time facts.
// No visual coordinates are stored in business data.
// ---------------------------------------------------------------------------

export const TIMELINE_START_TIME = "22:00";
export const TIMELINE_END_TIME = "08:00";
export const TIMELINE_HOURS_SPAN = 10; // 10 hours from 22:00 to 08:00
export const TIMELINE_TOTAL_MINUTES = TIMELINE_HOURS_SPAN * 60; // 600 minutes

export const TIMELINE_TIME_MARKS = [
  "22:00",
  "23:00",
  "00:00",
  "01:00",
  "02:00",
  "03:00",
  "04:00",
  "05:00",
  "06:00",
  "07:00",
  "08:00",
];

/** Parse "HH:MM" into minutes since midnight (0 to 1439). */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.trim().split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Returns minutes elapsed from the timeline start (22:00).
 * Handles cross-midnight clock wrap cleanly:
 * 22:00 -> 0
 * 23:00 -> 60
 * 00:00 -> 120
 * 01:00 -> 180
 * ...
 * 08:00 -> 600
 */
export function minutesFromTimelineStart(timeStr: string): number {
  const m = parseTimeToMinutes(timeStr);
  // 22:00 is 1320 minutes from midnight
  const startMin = 22 * 60; // 1320
  if (m >= startMin) {
    return m - startMin;
  }
  // Cross midnight (00:00 - 08:00): add elapsed minutes before midnight (120)
  return 120 + m;
}

/** Calculate duration between two times in minutes, handling midnight boundary. */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = minutesFromTimelineStart(startTime);
  let end = minutesFromTimelineStart(endTime);
  if (end < start) {
    end += 1440;
  }
  return Math.max(0, end - start);
}

export interface CalculatedBarPosition {
  leftPercent: number;
  widthPercent: number;
  startMinutes: number;
  durationMinutes: number;
}

/**
 * Calculate left percentage and width percentage within the 10-hour planning horizon.
 */
export function computeTimelineBarGeometry(
  startTime: string,
  endTime: string,
  totalSpanMinutes: number = TIMELINE_TOTAL_MINUTES
): CalculatedBarPosition {
  const startMin = minutesFromTimelineStart(startTime);
  const durationMin = calculateDurationMinutes(startTime, endTime);

  // Clamp left between 0% and 100%
  const leftPercent = Math.max(0, Math.min(100, (startMin / totalSpanMinutes) * 100));

  // Clamp width so it doesn't exceed 100% - leftPercent
  const maxAvailable = 100 - leftPercent;
  const rawWidth = (durationMin / totalSpanMinutes) * 100;
  const widthPercent = Math.max(1, Math.min(maxAvailable, rawWidth));

  return {
    leftPercent,
    widthPercent,
    startMinutes: startMin,
    durationMinutes: durationMin,
  };
}
