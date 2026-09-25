/** Direction of a track section — double-tracked routes carry UP + DOWN pairs. */
export type LineDirection = "UP" | "DOWN" | "SINGLE";

export type TrackStatus =
  | "clear"
  | "occupied"
  | "blocked"
  | "maintenance"
  | "caution";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface BlockInfo {
  blockId: string;
  reason: string;
  startTime: string; // "HH:MM" IST
  endTime: string; // "HH:MM" IST
  requestedBy: string; // department: Engineering, S&T, TRD
  approvalStatus: ApprovalStatus;
}

export interface Station {
  id: string;
  name: string;
  code: string; // e.g. "NDLS", "BCT"
  x: number; // layout position (React Flow canvas coords, manual — not auto-layout)
  y: number;
  /** Major interchange / junction stations get a subtle "JN" badge. */
  junction?: boolean;
}

export interface TrackSection {
  id: string;
  fromStationId: string;
  toStationId: string;
  name: string; // e.g. "Delhi–Ghaziabad UP Line"
  status: TrackStatus;
  line?: LineDirection;
  currentBlock?: BlockInfo;
}
