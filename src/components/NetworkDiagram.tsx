import { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow";
import SectionDetailPanel from "./SectionDetailPanel";
import StationNode, { type StationNodeData } from "./StationNode";
import StatusLegend from "./StatusLegend";
import TrackEdge, { type TrackEdgeData } from "./TrackEdge";
import { mockSections, mockStations } from "../data/mockRailwayData";
import type { Station, TrackSection, TrackStatus } from "../types";

const nodeTypes = { station: StationNode };
const edgeTypes = { track: TrackEdge };

const LANE_GAP = 9; // px between the UP and DOWN parallel lanes

type StatusFilter = "All" | "Clear" | "Blocked" | "Maintenance";

const FILTER_STATUSES: Record<StatusFilter, TrackStatus[] | null> = {
  All: null,
  Clear: ["clear"],
  Blocked: ["blocked"],
  Maintenance: ["maintenance"],
};

const FILTER_CHIP_STYLE: Record<StatusFilter, { dot: string; active: string }> = {
  All: { dot: "#878da1", active: "border-[#d9ddef] bg-[#f1f3f9] text-[#171a30]" },
  Clear: { dot: "#16a34a", active: "border-[#16a34a]/60 bg-[#f0fdf4] text-[#166534]" },
  Blocked: { dot: "#dc2626", active: "border-[#dc2626]/60 bg-[#fef2f2] text-[#991b1b]" },
  Maintenance: { dot: "#d97706", active: "border-[#d97706]/60 bg-[#fffbeb] text-[#92400e]" },
};

function matchesQuery(
  section: TrackSection,
  stationsById: Record<string, Station>,
  q: string
): boolean {
  const from = stationsById[section.fromStationId];
  const to = stationsById[section.toStationId];
  return (
    section.name.toLowerCase().includes(q) ||
    section.id.toLowerCase().includes(q) ||
    section.status.includes(q) ||
    (section.line ?? "").toLowerCase().includes(q) ||
    Boolean(from && (from.name.toLowerCase().includes(q) || from.code.toLowerCase().includes(q))) ||
    Boolean(to && (to.name.toLowerCase().includes(q) || to.code.toLowerCase().includes(q)))
  );
}

function DiagramInner() {
  const [clickedId, setClickedId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const { fitView } = useReactFlow();

  const stationsById = useMemo(
    () => Object.fromEntries(mockStations.map((s) => [s.id, s])) as Record<string, Station>,
    []
  );

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(mockSections.filter((s) => matchesQuery(s, stationsById, q)).map((s) => s.id));
  }, [searchQuery, stationsById]);

  // A search with exactly one hit behaves like a click (opens the panel);
  // closing the panel sets dismissedId so it doesn't pop open again.
  const singleSearchMatch = searchMatches.size === 1 ? [...searchMatches][0] : null;
  const selectedId =
    clickedId ?? (singleSearchMatch && singleSearchMatch !== dismissedId ? singleSearchMatch : null);
  const selectedSection = selectedId ? (mockSections.find((s) => s.id === selectedId) ?? null) : null;

  const handleSelect = useCallback((id: string) => setClickedId(id), []);

  const handlePaneClick = useCallback(() => {
    setClickedId(null);
    setDismissedId(null);
  }, []);

  const closePanel = useCallback(() => {
    setClickedId(null);
    if (singleSearchMatch) setDismissedId(singleSearchMatch);
  }, [singleSearchMatch]);

  const onSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    setDismissedId(null);
  }, []);

  // Station nodes with a live "active block at this junction" indicator
  const nodes = useMemo<Node<StationNodeData>[]>(() => {
    const blocksByStation = new Map<string, { count: number; hasBlocked: boolean }>();
    for (const sec of mockSections) {
      if (!sec.currentBlock) continue;
      if (sec.status !== "blocked" && sec.status !== "maintenance") continue;
      const blocked = sec.status === "blocked";
      for (const sid of [sec.fromStationId, sec.toStationId]) {
        const cur = blocksByStation.get(sid) ?? { count: 0, hasBlocked: false };
        cur.count += 1;
        cur.hasBlocked = cur.hasBlocked || blocked;
        blocksByStation.set(sid, cur);
      }
    }
    return mockStations.map((station) => {
      const info = blocksByStation.get(station.id);
      return {
        id: station.id,
        type: "station" as const,
        position: { x: station.x, y: station.y },
        data: {
          station,
          activeBlockCount: info?.count ?? 0,
          hasBlocked: info?.hasBlocked ?? false,
        },
        draggable: false,
        selectable: false,
        connectable: false,
        deletable: false,
      };
    });
  }, []);

  // Edges: UP/DOWN lane offsets + search/filter dimming + selection highlight
  const edges = useMemo<Edge<TrackEdgeData>[]>(() => {
    const pairCounts = new Map<string, number>();
    for (const s of mockSections) {
      const key = `${s.fromStationId}→${s.toStationId}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    const pairSeen = new Map<string, number>();
    const filterStatuses = FILTER_STATUSES[statusFilter];

    return mockSections.map((section) => {
      const key = `${section.fromStationId}→${section.toStationId}`;
      const idx = pairSeen.get(key) ?? 0;
      pairSeen.set(key, idx + 1);
      const isPair = (pairCounts.get(key) ?? 1) > 1;
      const laneOffset = isPair ? (idx === 0 ? -LANE_GAP : LANE_GAP) : 0;

      const matchSearch = searchMatches.size > 0 ? searchMatches.has(section.id) : true;
      const matchFilter = filterStatuses ? filterStatuses.includes(section.status) : true;
      const dimmed = !matchSearch || !matchFilter;
      const visualState: TrackEdgeData["visualState"] =
        section.id === selectedId ? "highlight" : dimmed ? "dimmed" : "normal";

      return {
        id: section.id,
        source: section.fromStationId,
        target: section.toStationId,
        sourceHandle: "r",
        targetHandle: "l",
        type: "track" as const,
        zIndex: visualState === "highlight" ? 400 : 0,
        data: { section, laneOffset, visualState, onSelect: handleSelect },
      };
    });
  }, [searchMatches, statusFilter, selectedId, handleSelect]);

  const summary = useMemo(
    () => ({
      total: mockSections.length,
      clear: mockSections.filter((s) => s.status === "clear").length,
      occupied: mockSections.filter((s) => s.status === "occupied").length,
      blocked: mockSections.filter((s) => s.status === "blocked").length,
      maintenance: mockSections.filter((s) => s.status === "maintenance").length,
      caution: mockSections.filter((s) => s.status === "caution").length,
    }),
    []
  );

  const activeBlocks = useMemo(
    () =>
      mockSections.filter(
        (s) => s.currentBlock && (s.status === "blocked" || s.status === "maintenance")
      ),
    []
  );

  const matchCount = searchQuery.trim() ? searchMatches.size : null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden lg:flex-row">
      {/* Canvas column (~70% width on desktop) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Search + status filter bar */}
        <div className="flex flex-col gap-3 border-b border-[#e3e6f0] bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative w-full min-w-0 max-w-xs">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#878da1"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search station or section…"
                className="focus-primary w-full rounded-lg border border-[#e3e6f0] bg-white py-1.5 pl-9 pr-8 text-xs font-medium text-[#171a30] placeholder:text-[#a2a7ba] transition-colors duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#a2a7ba] transition-colors duration-200 hover:text-[#171a30]"
                  title="Clear search"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
            {matchCount !== null && (
              <span className="whitespace-nowrap font-mono text-[10px] font-semibold text-[#878da1]">
                {matchCount} match{matchCount === 1 ? "" : "es"}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(FILTER_STATUSES) as StatusFilter[]).map((chip) => {
              const active = statusFilter === chip;
              const style = FILTER_CHIP_STYLE[chip];
              return (
                <button
                  key={chip}
                  onClick={() => setStatusFilter(active ? "All" : chip)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors duration-200",
                    active
                      ? style.active
                      : "border-[#e3e6f0] bg-white text-[#4d5468] hover:border-[#c9cde8] hover:text-[#171a30]",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: style.dot }} />
                  {chip}
                </button>
              );
            })}
            <span className="mx-1 hidden h-4 w-px bg-[#e3e6f0] sm:block" />
            <button
              onClick={() => fitView({ padding: 0.15, duration: 300 })}
              className="rounded-lg border border-[#e3e6f0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4d5468] transition-colors duration-200 hover:bg-[#f5f6fc] hover:text-[#171a30]"
              title="Reset view"
            >
              Fit view
            </button>
          </div>
        </div>

        {/* React Flow canvas */}
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onPaneClick={handlePaneClick}
            onEdgeClick={(_, edge) => {
              const d = edge.data as TrackEdgeData | undefined;
              if (d?.section?.id) handleSelect(d.section.id);
            }}
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
            minZoom={0.35}
            maxZoom={1.75}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesUpdatable={false}
            deleteKeyCode={null}
          >
            <Background color="#dde1ee" gap={22} size={1} />
            <Controls position="top-right" showInteractive={false} />
            <Panel position="bottom-left">
              <StatusLegend />
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* Detail panel — 30% column on desktop, bottom sheet on mobile */}
      <SectionDetailPanel
        section={selectedSection}
        stationsById={stationsById}
        summary={summary}
        activeBlocks={activeBlocks}
        onSelect={handleSelect}
        onClose={closePanel}
      />
    </div>
  );
}

function NetworkDiagram() {
  return (
    <ReactFlowProvider>
      <DiagramInner />
    </ReactFlowProvider>
  );
}

export default NetworkDiagram;
