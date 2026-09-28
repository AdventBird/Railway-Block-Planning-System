import type { ApprovalStatus, TrackStatus } from "../types";

export type LineDirectionType = "UP" | "DOWN" | "BOTH";
export type LineTrackType = "SINGLE" | "DOUBLE";

export interface PlannedBlockDetail {
  blockId: string;
  name?: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string;
  jobsCount: number;
  expectedImpact: string;
  reason: string;
  requestedBy: string;
  approvalStatus: ApprovalStatus;
}

export interface PlannedTrainMovement {
  trainNumber: string;
  trainName?: string;
  direction: string;
  timeWindow: string;
}

export interface CanonicalTrack {
  id: string;
  sectionId: string;
  direction: LineDirectionType;
  lineType: LineTrackType;
  status: TrackStatus;
  speedLimitKmH: number;
  electrification: string;
  lastUpdated: string;
  plannedBlock?: PlannedBlockDetail;
  plannedMovements?: PlannedTrainMovement[];
}

export interface CanonicalSection {
  id: string;
  fromStationId: string;
  toStationId: string;
  name: string;
  lineType: LineTrackType;
  distanceKm: number;
  electrification: string;
  speedLimitKmH: number;
  tracks: CanonicalTrack[];
  status: TrackStatus;
}

export interface CanonicalStation {
  id: string;
  code: string;
  name: string;
  junction?: boolean;
  division?: string;
}

export const CANONICAL_STATIONS: CanonicalStation[] = [
  { id: "NDLS", code: "NDLS", name: "New Delhi", junction: true, division: "DLI" },
  { id: "GZB", code: "GZB", name: "Ghaziabad", junction: true, division: "DLI" },
  { id: "DADRI", code: "DADRI", name: "Dadri", junction: false, division: "DLI" },
  { id: "ALJN", code: "ALJN", name: "Aligarh", junction: true, division: "PRYJ" },
  { id: "TDL", code: "TDL", name: "Tundla Jn.", junction: true, division: "PRYJ" },
  { id: "CNB", code: "CNB", name: "Kanpur Central", junction: true, division: "PRYJ" },
  { id: "PRYJ", code: "PRYJ", name: "Prayagraj Jn.", junction: true, division: "PRYJ" },
  { id: "DDU", code: "DDU", name: "Pt. Deen Dayal Upadhyaya", junction: true, division: "DDU" },
  { id: "BSB", code: "BSB", name: "Varanasi Jn.", junction: false, division: "BSB" },
  { id: "LKO", code: "LKO", name: "Lucknow Charbagh", junction: true, division: "LKO" },
];

export const CANONICAL_STATIONS_BY_ID: Record<string, CanonicalStation> = Object.fromEntries(
  CANONICAL_STATIONS.map((s) => [s.id, s])
);

export const CANONICAL_SECTIONS: CanonicalSection[] = [
  {
    id: "SEC-NDLS-GZB",
    fromStationId: "NDLS",
    toStationId: "GZB",
    name: "NDLS – GZB",
    lineType: "DOUBLE",
    distanceKm: 17,
    electrification: "25 kV AC",
    speedLimitKmH: 130,
    status: "maintenance",
    tracks: [
      {
        id: "TRK-NDLS-GZB-UP",
        sectionId: "SEC-NDLS-GZB",
        direction: "UP",
        lineType: "DOUBLE",
        status: "maintenance",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:15",
        plannedBlock: {
          blockId: "W1",
          name: "Corridor C1 Planned Maintenance",
          date: "17 Sep 2026",
          startTime: "01:00",
          endTime: "04:00",
          duration: "3h 00m",
          jobsCount: 3,
          expectedImpact: "25 min delay",
          reason: "Rail fracture weld repair & signal lamp replacement",
          requestedBy: "Engineering & S&T",
          approvalStatus: "approved",
        },
        plannedMovements: [
          { trainNumber: "12951", trainName: "Mumbai Rajdhani", direction: "NDLS → GZB", timeWindow: "22:40 – 23:05" },
          { trainNumber: "12419", trainName: "Gomti Express", direction: "NDLS → GZB", timeWindow: "05:20 – 05:45" },
        ],
      },
      {
        id: "TRK-NDLS-GZB-DN",
        sectionId: "SEC-NDLS-GZB",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:15",
        plannedMovements: [
          { trainNumber: "12314", trainName: "Sealdah Rajdhani", direction: "GZB → NDLS", timeWindow: "06:10 – 06:35" },
        ],
      },
    ],
  },
  {
    id: "SEC-GZB-ALJN",
    fromStationId: "GZB",
    toStationId: "ALJN",
    name: "GZB – ALJN",
    lineType: "DOUBLE",
    distanceKm: 61,
    electrification: "25 kV AC",
    speedLimitKmH: 130,
    status: "blocked",
    tracks: [
      {
        id: "TRK-GZB-ALJN-UP",
        sectionId: "SEC-GZB-ALJN",
        direction: "UP",
        lineType: "DOUBLE",
        status: "blocked",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 03:00",
        plannedBlock: {
          blockId: "W2",
          name: "Ballast Profiling & Grinding",
          date: "17 Sep 2026",
          startTime: "01:30",
          endTime: "04:45",
          duration: "3h 15m",
          jobsCount: 2,
          expectedImpact: "35 min delay",
          reason: "Rail Grinding Machine RGM-04 ballast profiling between KM 32/8 and 38/2",
          requestedBy: "Engineering",
          approvalStatus: "approved",
        },
        plannedMovements: [
          { trainNumber: "12424", trainName: "Dibrugarh Rajdhani", direction: "GZB → ALJN", timeWindow: "23:10 – 23:45" },
        ],
      },
      {
        id: "TRK-GZB-ALJN-DN",
        sectionId: "SEC-GZB-ALJN",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "caution",
        speedLimitKmH: 60,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 03:00",
        plannedMovements: [
          { trainNumber: "12876", trainName: "Neelachal Express", direction: "ALJN → GZB", timeWindow: "04:50 – 05:25" },
        ],
      },
    ],
  },
  {
    id: "SEC-GZB-DADRI",
    fromStationId: "GZB",
    toStationId: "DADRI",
    name: "GZB – DADRI",
    lineType: "DOUBLE",
    distanceKm: 20,
    electrification: "25 kV AC",
    speedLimitKmH: 130,
    status: "clear",
    tracks: [
      {
        id: "TRK-GZB-DADRI-UP",
        sectionId: "SEC-GZB-DADRI",
        direction: "UP",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:00",
      },
      {
        id: "TRK-GZB-DADRI-DN",
        sectionId: "SEC-GZB-DADRI",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:00",
      },
    ],
  },
  {
    id: "SEC-DADRI-ALJN",
    fromStationId: "DADRI",
    toStationId: "ALJN",
    name: "DADRI – ALJN",
    lineType: "DOUBLE",
    distanceKm: 41,
    electrification: "25 kV AC",
    speedLimitKmH: 130,
    status: "blocked",
    tracks: [
      {
        id: "TRK-DADRI-ALJN-UP",
        sectionId: "SEC-DADRI-ALJN",
        direction: "UP",
        lineType: "DOUBLE",
        status: "blocked",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:00",
        plannedBlock: {
          blockId: "W2",
          name: "Ballast Profiling & Grinding",
          date: "17 Sep 2026",
          startTime: "01:30",
          endTime: "04:45",
          duration: "3h 15m",
          jobsCount: 2,
          expectedImpact: "35 min delay",
          reason: "Rail Grinding Machine RGM-04 working between Dadri and Aligarh",
          requestedBy: "Engineering",
          approvalStatus: "approved",
        },
      },
      {
        id: "TRK-DADRI-ALJN-DN",
        sectionId: "SEC-DADRI-ALJN",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "caution",
        speedLimitKmH: 60,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:00",
      },
    ],
  },
  {
    id: "SEC-ALJN-TDL",
    fromStationId: "ALJN",
    toStationId: "TDL",
    name: "ALJN – TDL",
    lineType: "DOUBLE",
    distanceKm: 38,
    electrification: "25 kV AC",
    speedLimitKmH: 130,
    status: "clear",
    tracks: [
      {
        id: "TRK-ALJN-TDL-UP",
        sectionId: "SEC-ALJN-TDL",
        direction: "UP",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 01:45",
      },
      {
        id: "TRK-ALJN-TDL-DN",
        sectionId: "SEC-ALJN-TDL",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 01:45",
      },
    ],
  },
  {
    id: "SEC-TDL-CNB",
    fromStationId: "TDL",
    toStationId: "CNB",
    name: "TDL – CNB",
    lineType: "DOUBLE",
    distanceKm: 52,
    electrification: "25 kV AC",
    speedLimitKmH: 120,
    status: "maintenance",
    tracks: [
      {
        id: "TRK-TDL-CNB-UP",
        sectionId: "SEC-TDL-CNB",
        direction: "UP",
        lineType: "DOUBLE",
        status: "maintenance",
        speedLimitKmH: 120,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:40",
        plannedBlock: {
          blockId: "W3",
          name: "Interlocking & Point Machine Overhaul",
          date: "17 Sep 2026",
          startTime: "01:30",
          endTime: "05:30",
          duration: "4h 00m",
          jobsCount: 3,
          expectedImpact: "40 min delay",
          reason: "Electronic Interlocking renewal & point machine overhaul at yard throat",
          requestedBy: "S&T",
          approvalStatus: "pending",
        },
      },
      {
        id: "TRK-TDL-CNB-DN",
        sectionId: "SEC-TDL-CNB",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "occupied",
        speedLimitKmH: 120,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:40",
        plannedMovements: [
          { trainNumber: "12301", trainName: "Howrah Rajdhani", direction: "CNB → TDL", timeWindow: "03:15 – 03:55" },
        ],
      },
    ],
  },
  {
    id: "SEC-CNB-PRYJ",
    fromStationId: "CNB",
    toStationId: "PRYJ",
    name: "CNB – PRYJ",
    lineType: "DOUBLE",
    distanceKm: 170,
    electrification: "25 kV AC",
    speedLimitKmH: 130,
    status: "clear",
    tracks: [
      {
        id: "TRK-CNB-PRYJ-UP",
        sectionId: "SEC-CNB-PRYJ",
        direction: "UP",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:15",
      },
      {
        id: "TRK-CNB-PRYJ-DN",
        sectionId: "SEC-CNB-PRYJ",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:15",
      },
    ],
  },
  {
    id: "SEC-GZB-DDU",
    fromStationId: "GZB",
    toStationId: "DDU",
    name: "GZB – DDU",
    lineType: "DOUBLE",
    distanceKm: 417,
    electrification: "25 kV AC",
    speedLimitKmH: 130,
    status: "blocked",
    tracks: [
      {
        id: "TRK-GZB-DDU-UP",
        sectionId: "SEC-GZB-DDU",
        direction: "UP",
        lineType: "DOUBLE",
        status: "blocked",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 03:10",
        plannedBlock: {
          blockId: "W4",
          name: "Heavy Catenary Wire Renewal",
          date: "17 Sep 2026",
          startTime: "02:00",
          endTime: "05:30",
          duration: "3h 30m",
          jobsCount: 2,
          expectedImpact: "45 min delay",
          reason: "TRD Power Block - 25 kV OHE catenary wire renewal with Tower Wagon",
          requestedBy: "TRD",
          approvalStatus: "approved",
        },
      },
      {
        id: "TRK-GZB-DDU-DN",
        sectionId: "SEC-GZB-DDU",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "occupied",
        speedLimitKmH: 130,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 03:10",
      },
    ],
  },
  {
    id: "SEC-DDU-BSB",
    fromStationId: "DDU",
    toStationId: "BSB",
    name: "DDU – BSB",
    lineType: "SINGLE",
    distanceKm: 84,
    electrification: "25 kV AC",
    speedLimitKmH: 90,
    status: "caution",
    tracks: [
      {
        id: "TRK-DDU-BSB-BOTH",
        sectionId: "SEC-DDU-BSB",
        direction: "BOTH",
        lineType: "SINGLE",
        status: "caution",
        speedLimitKmH: 60,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 02:45",
        plannedBlock: {
          blockId: "BLK-2026-0423",
          name: "Single Line Token Block",
          date: "17 Sep 2026",
          startTime: "02:00",
          endTime: "05:30",
          duration: "3h 30m",
          jobsCount: 1,
          expectedImpact: "50 min delay",
          reason: "Insulator replacement on single line. Restricted token authority.",
          requestedBy: "TRD",
          approvalStatus: "approved",
        },
      },
    ],
  },
  {
    id: "SEC-ALJN-LKO",
    fromStationId: "ALJN",
    toStationId: "LKO",
    name: "ALJN – LKO",
    lineType: "DOUBLE",
    distanceKm: 239,
    electrification: "25 kV AC",
    speedLimitKmH: 110,
    status: "clear",
    tracks: [
      {
        id: "TRK-ALJN-LKO-UP",
        sectionId: "SEC-ALJN-LKO",
        direction: "UP",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 110,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 01:30",
      },
      {
        id: "TRK-ALJN-LKO-DN",
        sectionId: "SEC-ALJN-LKO",
        direction: "DOWN",
        lineType: "DOUBLE",
        status: "clear",
        speedLimitKmH: 110,
        electrification: "25 kV AC",
        lastUpdated: "26 Sep 2026, 01:30",
      },
    ],
  },
];

export const CANONICAL_SECTIONS_BY_ID: Record<string, CanonicalSection> = Object.fromEntries(
  CANONICAL_SECTIONS.map((s) => [s.id, s])
);

/** Default corridor path from New Delhi to Prayagraj */
export const DEFAULT_SELECTED_PATH: string[] = ["NDLS", "GZB", "ALJN", "TDL", "CNB", "PRYJ"];

/** Find canonical section connecting two adjacent station IDs (order-agnostic) */
export function findSectionBetween(fromStationId: string, toStationId: string): CanonicalSection | undefined {
  return CANONICAL_SECTIONS.find(
    (s) =>
      (s.fromStationId === fromStationId && s.toStationId === toStationId) ||
      (s.fromStationId === toStationId && s.toStationId === fromStationId)
  );
}

/** Check if two stations have a direct link */
export function areStationsDirectlyConnected(stationA: string, stationB: string): boolean {
  return findSectionBetween(stationA, stationB) !== undefined;
}

/** Get list of directly adjacent stations */
export function getAdjacentStations(stationId: string): string[] {
  const neighbors: string[] = [];
  for (const s of CANONICAL_SECTIONS) {
    if (s.fromStationId === stationId) neighbors.push(s.toStationId);
    else if (s.toStationId === stationId) neighbors.push(s.fromStationId);
  }
  return Array.from(new Set(neighbors));
}

/**
 * Given two adjacent path stations, returns valid intermediate stations that can be inserted.
 * e.g. between GZB and ALJN, DADRI can be inserted because GZB-DADRI and DADRI-ALJN exist.
 */
export function getValidIntermediateStations(stationA: string, stationB: string): string[] {
  const valid: string[] = [];
  for (const station of CANONICAL_STATIONS) {
    if (station.id === stationA || station.id === stationB) continue;
    if (areStationsDirectlyConnected(stationA, station.id) && areStationsDirectlyConnected(station.id, stationB)) {
      valid.push(station.id);
    }
  }
  return valid;
}

/**
 * Derive all section IDs along an ordered path of stations.
 */
export function getSectionsForPath(path: string[]): CanonicalSection[] {
  const sections: CanonicalSection[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const sec = findSectionBetween(path[i], path[i + 1]);
    if (sec && !sections.includes(sec)) {
      sections.push(sec);
    }
  }
  return sections;
}

/**
 * Shortest path search (BFS) on canonical railway topology.
 */
export function findShortestPath(fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];
  const queue: string[][] = [[fromId]];
  const visited = new Set<string>([fromId]);

  while (queue.length > 0) {
    const currentPath = queue.shift()!;
    const lastNode = currentPath[currentPath.length - 1];
    const neighbors = getAdjacentStations(lastNode);

    for (const next of neighbors) {
      if (next === toId) {
        return [...currentPath, next];
      }
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...currentPath, next]);
      }
    }
  }
  return null;
}

export interface CalculatedNodePosition {
  x: number;
  y: number;
}

/**
 * Deterministic graph auto-layout:
 * - Places stations on the selectedPath along a horizontal spine (y = 120).
 * - Spacing scales smoothly based on station count.
 * - Places branch stations naturally under their parent junctions.
 * - Stations outside the path are positioned deterministically relative to connected path nodes.
 */
export function calculateNetworkLayout(
  allStations: CanonicalStation[],
  selectedPath: string[]
): Record<string, CalculatedNodePosition> {
  const positions: Record<string, CalculatedNodePosition> = {};
  const SPACING_X = 220;
  const START_X = 60;
  const SPINE_Y = 120;
  const BRANCH_Y_ROW2 = 360;

  // 1. Position path stations horizontally
  selectedPath.forEach((stationId, idx) => {
    positions[stationId] = {
      x: START_X + idx * SPACING_X,
      y: SPINE_Y,
    };
  });

  // 2. Position specific branch stations relative to their junctions
  // DDU is south of GZB
  const gzbPos = positions["GZB"] ?? { x: START_X + SPACING_X, y: SPINE_Y };
  if (!positions["DDU"]) {
    positions["DDU"] = {
      x: gzbPos.x,
      y: BRANCH_Y_ROW2,
    };
  }

  // BSB is east of DDU
  const dduPos = positions["DDU"];
  if (!positions["BSB"]) {
    positions["BSB"] = {
      x: dduPos.x + SPACING_X,
      y: BRANCH_Y_ROW2,
    };
  }

  // LKO is south of ALJN
  const aljnPos = positions["ALJN"] ?? { x: START_X + 2 * SPACING_X, y: SPINE_Y };
  if (!positions["LKO"]) {
    positions["LKO"] = {
      x: aljnPos.x,
      y: BRANCH_Y_ROW2,
    };
  }

  // DADRI is between GZB and ALJN if not already in path
  if (!positions["DADRI"]) {
    positions["DADRI"] = {
      x: (gzbPos.x + aljnPos.x) / 2,
      y: SPINE_Y,
    };
  }

  // 3. Fallback for any other station:
  allStations.forEach((s, idx) => {
    if (!positions[s.id]) {
      positions[s.id] = {
        x: START_X + idx * SPACING_X,
        y: SPINE_Y,
      };
    }
  });

  return positions;
}
