import type { TrackStatus } from "../types";

export interface StatusMeta {
  label: string;
  color: string;
  dashed?: boolean;
  pulse?: boolean;
}

/**
 * Single source of truth for track-status colors — used by the custom edge,
 * the legend, the filter chips and the detail panel. Light theme:
 * red = blocked only, amber = maintenance/caution, green = clear,
 * primary blue = occupied (a normal, healthy state).
 */
export const STATUS_META: Record<TrackStatus, StatusMeta> = {
  clear: { label: "Clear", color: "#16a34a" },
  occupied: { label: "Occupied", color: "#2e3092" },
  blocked: { label: "Blocked", color: "#dc2626", pulse: true },
  maintenance: { label: "Maintenance", color: "#d97706", dashed: true },
  caution: { label: "Caution", color: "#ca8a04" },
};

/** Highlight (selection / search match) color — the primary blue glow. */
export const HIGHLIGHT_COLOR = "#2e3092";

/** Departments are neutral (no per-department colors) — label only. */
export const DEPARTMENT_META: Record<string, { label: string; color: string; bg: string }> = {
  Engineering: { label: "Engineering (P-Way)", color: "#4d5468", bg: "#f1f3f9" },
  "S&T": { label: "S&T (Signals & Telecom)", color: "#4d5468", bg: "#f1f3f9" },
  TRD: { label: "TRD (Traction Distribution)", color: "#4d5468", bg: "#f1f3f9" },
};

export const APPROVAL_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending approval", color: "#d97706", bg: "#fffbeb" },
  approved: { label: "Approved", color: "#16a34a", bg: "#f0fdf4" },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fef2f2" },
};

export const FALLBACK_META = { label: "—", color: "#4d5468", bg: "#f1f3f9" };