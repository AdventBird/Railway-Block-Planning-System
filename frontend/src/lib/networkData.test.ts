import { describe, expect, it } from "vitest";
import {
  CANONICAL_STATIONS,
  CANONICAL_STATIONS_BY_ID,
  CANONICAL_SECTIONS_BY_ID,
  calculateNetworkLayout,
  findSectionBetween,
  findShortestPath,
  getAdjacentStations,
  getSectionsForPath,
  getValidIntermediateStations,
} from "../data/networkData";

describe("Network Canonical Data & Topology Model", () => {
  it("defines canonical stations with valid identifiers, codes, and names", () => {
    expect(CANONICAL_STATIONS.length).toBeGreaterThanOrEqual(10);
    expect(CANONICAL_STATIONS_BY_ID["NDLS"]).toBeDefined();
    expect(CANONICAL_STATIONS_BY_ID["NDLS"].code).toBe("NDLS");
    expect(CANONICAL_STATIONS_BY_ID["NDLS"].name).toBe("New Delhi");
    expect(CANONICAL_STATIONS_BY_ID["GZB"].junction).toBe(true);
    expect(CANONICAL_STATIONS_BY_ID["PRYJ"].code).toBe("PRYJ");
  });

  it("distinguishes double-line sections with separate UP and DOWN tracks", () => {
    const ndlsGzb = CANONICAL_SECTIONS_BY_ID["SEC-NDLS-GZB"];
    expect(ndlsGzb).toBeDefined();
    expect(ndlsGzb.lineType).toBe("DOUBLE");
    expect(ndlsGzb.distanceKm).toBe(17);
    expect(ndlsGzb.tracks.length).toBe(2);

    const upTrack = ndlsGzb.tracks.find((t) => t.direction === "UP");
    const dnTrack = ndlsGzb.tracks.find((t) => t.direction === "DOWN");

    expect(upTrack).toBeDefined();
    expect(dnTrack).toBeDefined();
    expect(upTrack?.direction).toBe("UP");
    expect(dnTrack?.direction).toBe("DOWN");

    // UP and DOWN have independent operational statuses
    expect(upTrack?.status).toBe("maintenance");
    expect(dnTrack?.status).toBe("clear");
  });

  it("correctly models single-line sections with BOTH directions", () => {
    const dduBsb = CANONICAL_SECTIONS_BY_ID["SEC-DDU-BSB"];
    expect(dduBsb).toBeDefined();
    expect(dduBsb.lineType).toBe("SINGLE");
    expect(dduBsb.distanceKm).toBe(84);
    expect(dduBsb.tracks.length).toBe(1);
    expect(dduBsb.tracks[0].direction).toBe("BOTH");
    expect(dduBsb.tracks[0].lineType).toBe("SINGLE");
  });

  it("attaches planned block markers directly to affected tracks", () => {
    const ndlsGzbUp = CANONICAL_SECTIONS_BY_ID["SEC-NDLS-GZB"].tracks.find((t) => t.direction === "UP");
    expect(ndlsGzbUp?.plannedBlock).toBeDefined();
    expect(ndlsGzbUp?.plannedBlock?.blockId).toBe("W1");
    expect(ndlsGzbUp?.plannedBlock?.startTime).toBe("01:00");
    expect(ndlsGzbUp?.plannedBlock?.endTime).toBe("04:00");
    expect(ndlsGzbUp?.plannedBlock?.jobsCount).toBe(3);

    const gzbAljnUp = CANONICAL_SECTIONS_BY_ID["SEC-GZB-ALJN"].tracks.find((t) => t.direction === "UP");
    expect(gzbAljnUp?.plannedBlock?.blockId).toBe("W2");

    const tdlCnbUp = CANONICAL_SECTIONS_BY_ID["SEC-TDL-CNB"].tracks.find((t) => t.direction === "UP");
    expect(tdlCnbUp?.plannedBlock?.blockId).toBe("W3");

    const gzbDduUp = CANONICAL_SECTIONS_BY_ID["SEC-GZB-DDU"].tracks.find((t) => t.direction === "UP");
    expect(gzbDduUp?.plannedBlock?.blockId).toBe("W4");
  });
});

describe("Path Finding & Topology Algorithms", () => {
  it("finds the shortest path between origin and destination", () => {
    const path = findShortestPath("NDLS", "PRYJ");
    expect(path).toEqual(["NDLS", "GZB", "ALJN", "TDL", "CNB", "PRYJ"]);
  });

  it("finds shortest path to branch stations", () => {
    const pathToVaranasi = findShortestPath("GZB", "BSB");
    expect(pathToVaranasi).toEqual(["GZB", "DDU", "BSB"]);

    const pathToLucknow = findShortestPath("NDLS", "LKO");
    expect(pathToLucknow).toEqual(["NDLS", "GZB", "ALJN", "LKO"]);
  });

  it("returns adjacent stations for any station", () => {
    const gzbNeighbors = getAdjacentStations("GZB");
    expect(gzbNeighbors).toContain("NDLS");
    expect(gzbNeighbors).toContain("ALJN");
    expect(gzbNeighbors).toContain("DADRI");
    expect(gzbNeighbors).toContain("DDU");
  });

  it("identifies valid intermediate stations between connected nodes", () => {
    const intermediates = getValidIntermediateStations("GZB", "ALJN");
    expect(intermediates).toContain("DADRI");
  });

  it("derives dynamic sections from an ordered path of stations", () => {
    const path = ["NDLS", "GZB", "ALJN", "TDL", "CNB", "PRYJ"];
    const sections = getSectionsForPath(path);
    expect(sections.length).toBe(5);
    expect(sections[0].id).toBe("SEC-NDLS-GZB");
    expect(sections[1].id).toBe("SEC-GZB-ALJN");
    expect(sections[2].id).toBe("SEC-ALJN-TDL");
    expect(sections[3].id).toBe("SEC-TDL-CNB");
    expect(sections[4].id).toBe("SEC-CNB-PRYJ");
  });

  it("dynamically adapts when an intermediate station is inserted", () => {
    // Insert DADRI between GZB and ALJN
    const modifiedPath = ["NDLS", "GZB", "DADRI", "ALJN", "TDL", "CNB", "PRYJ"];
    const sections = getSectionsForPath(modifiedPath);
    expect(sections.length).toBe(6);
    expect(sections[0].id).toBe("SEC-NDLS-GZB");
    expect(sections[1].id).toBe("SEC-GZB-DADRI");
    expect(sections[2].id).toBe("SEC-DADRI-ALJN");
    expect(sections[3].id).toBe("SEC-ALJN-TDL");
  });

  it("dynamically adapts when an intermediate station is removed", () => {
    const pathWithDadri = ["NDLS", "GZB", "DADRI", "ALJN", "TDL", "CNB", "PRYJ"];
    const pathWithoutDadri = pathWithDadri.filter((s) => s !== "DADRI");
    const sections = getSectionsForPath(pathWithoutDadri);
    expect(sections.length).toBe(5);
    expect(sections[1].id).toBe("SEC-GZB-ALJN");
  });

  it("finds section between stations in either direction", () => {
    const secForward = findSectionBetween("NDLS", "GZB");
    const secBackward = findSectionBetween("GZB", "NDLS");
    expect(secForward).toBeDefined();
    expect(secBackward).toBeDefined();
    expect(secForward?.id).toBe(secBackward?.id);
  });
});

describe("Deterministic Layout Calculator", () => {
  it("positions corridor path nodes horizontally along the spine line", () => {
    const path = ["NDLS", "GZB", "ALJN", "TDL", "CNB", "PRYJ"];
    const positions = calculateNetworkLayout(CANONICAL_STATIONS, path);

    // All path nodes must share the same horizontal Y spine line
    expect(positions["NDLS"].y).toBe(120);
    expect(positions["GZB"].y).toBe(120);
    expect(positions["ALJN"].y).toBe(120);
    expect(positions["TDL"].y).toBe(120);
    expect(positions["CNB"].y).toBe(120);
    expect(positions["PRYJ"].y).toBe(120);

    // X coordinates must strictly increase from origin to destination
    expect(positions["GZB"].x).toBeGreaterThan(positions["NDLS"].x);
    expect(positions["ALJN"].x).toBeGreaterThan(positions["GZB"].x);
    expect(positions["TDL"].x).toBeGreaterThan(positions["ALJN"].x);
    expect(positions["CNB"].x).toBeGreaterThan(positions["TDL"].x);
    expect(positions["PRYJ"].x).toBeGreaterThan(positions["CNB"].x);
  });

  it("places branch routes naturally on row 2 below their parent junctions", () => {
    const path = ["NDLS", "GZB", "ALJN", "TDL", "CNB", "PRYJ"];
    const positions = calculateNetworkLayout(CANONICAL_STATIONS, path);

    // DDU drops vertically south of GZB
    expect(positions["DDU"].x).toBe(positions["GZB"].x);
    expect(positions["DDU"].y).toBe(360);

    // BSB extends east from DDU
    expect(positions["BSB"].x).toBeGreaterThan(positions["DDU"].x);
    expect(positions["BSB"].y).toBe(360);

    // LKO drops vertically south of ALJN
    expect(positions["LKO"].x).toBe(positions["ALJN"].x);
    expect(positions["LKO"].y).toBe(360);
  });
});
