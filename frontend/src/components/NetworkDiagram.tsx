import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";

import StationNode from "./network/StationNode";
import SectionEdge from "./network/SectionEdge";
import PathControls from "./network/PathControls";
import SectionInspector from "./network/SectionInspector";
import NetworkLegend from "./network/NetworkLegend";

import {
  CANONICAL_SECTIONS,
  CANONICAL_STATIONS,
  CANONICAL_SECTIONS_BY_ID,
  DEFAULT_SELECTED_PATH,
  calculateNetworkLayout,
  getSectionsForPath,
} from "../data/networkData";

const nodeTypes = {
  station: StationNode,
};

const edgeTypes = {
  sectionEdge: SectionEdge,
};

interface NetworkDiagramProps {
  onShowPlanningImpact?: (blockId: string, date?: string, sectionId?: string, trackId?: string) => void;
}

function DiagramInner({ onShowPlanningImpact }: NetworkDiagramProps) {
  const [selectedPath, setSelectedPath] = useState<string[]>(DEFAULT_SELECTED_PATH);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"overview" | "up" | "down" | "single">("overview");

  const [searchQuery, setSearchQuery] = useState("");
  const { fitView } = useReactFlow();

  // Initial fit-to-view once rendered
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.15, maxZoom: 1.25, duration: 400 });
    }, 150);
    return () => clearTimeout(timer);
  }, [fitView]);

  // Derived sections on the current selected path
  const pathSections = useMemo(() => getSectionsForPath(selectedPath), [selectedPath]);
  const pathSectionIdSet = useMemo(() => new Set(pathSections.map((s) => s.id)), [pathSections]);
  const selectedStationSet = useMemo(() => new Set(selectedPath), [selectedPath]);

  // Deterministic positions for all stations based on the active path
  const stationPositions = useMemo(
    () => calculateNetworkLayout(CANONICAL_STATIONS, selectedPath),
    [selectedPath]
  );

  // Handle station selection
  const handleSelectStation = useCallback((stationId: string) => {
    setSelectedStationId(stationId);
    // Find first section touching this station to inspect
    const touchingSection = CANONICAL_SECTIONS.find(
      (s) => s.fromStationId === stationId || s.toStationId === stationId
    );
    if (touchingSection) {
      setSelectedSectionId(touchingSection.id);
      setSelectedTrackId(null);
      setInspectorTab("overview");
      setInspectorOpen(true);
    }
  }, []);

  // Handle full section selection
  const handleSelectSection = useCallback((sectionId: string) => {
    setSelectedSectionId(sectionId);
    setSelectedTrackId(null);
    setSelectedStationId(null);
    const sec = CANONICAL_SECTIONS_BY_ID[sectionId];
    if (sec && sec.lineType === "SINGLE") {
      setInspectorTab("single");
    } else {
      setInspectorTab("overview");
    }
    setInspectorOpen(true);
  }, []);

  // Handle specific track selection (UP / DOWN / BOTH)
  const handleSelectTrack = useCallback((trackId: string, direction: "UP" | "DOWN" | "BOTH") => {
    // Find parent section
    const parentSection = CANONICAL_SECTIONS.find((s) => s.tracks.some((t) => t.id === trackId));
    if (parentSection) {
      setSelectedSectionId(parentSection.id);
      setSelectedTrackId(trackId);
      setSelectedStationId(null);
      if (direction === "UP") setInspectorTab("up");
      else if (direction === "DOWN") setInspectorTab("down");
      else setInspectorTab("single");
      setInspectorOpen(true);
    }
  }, []);

  // Handle clicking a planned block marker
  const handleSelectBlock = useCallback(
    (_blockId: string, sectionId: string, trackId: string) => {
      setSelectedSectionId(sectionId);
      setSelectedTrackId(trackId);
      setSelectedStationId(null);
      const parentSection = CANONICAL_SECTIONS_BY_ID[sectionId];
      const track = parentSection?.tracks.find((t) => t.id === trackId);
      if (track?.direction === "UP") setInspectorTab("up");
      else if (track?.direction === "DOWN") setInspectorTab("down");
      else setInspectorTab("single");
      setInspectorOpen(true);
    },
    []
  );

  // Close inspector
  const handleCloseInspector = useCallback(() => {
    setInspectorOpen(false);
    setSelectedSectionId(null);
    setSelectedTrackId(null);
  }, []);

  // Search filter
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    const q = query.trim().toUpperCase();
    if (!q) return;

    // Direct station match
    const matchedStation = CANONICAL_STATIONS.find(
      (s) => s.code.toUpperCase() === q || s.name.toUpperCase().includes(q)
    );
    if (matchedStation) {
      handleSelectStation(matchedStation.id);
      return;
    }

    // Direct section match
    const matchedSection = CANONICAL_SECTIONS.find(
      (s) =>
        s.name.toUpperCase().includes(q) ||
        s.id.toUpperCase().includes(q) ||
        `${s.fromStationId}-${s.toStationId}`.toUpperCase().includes(q)
    );
    if (matchedSection) {
      handleSelectSection(matchedSection.id);
    }
  };

  // Convert stations to ReactFlow nodes
  const nodes = useMemo<Node[]>(() => {
    return CANONICAL_STATIONS.map((station) => {
      const pos = stationPositions[station.id] ?? { x: 100, y: 120 };
      const isOnPath = selectedStationSet.has(station.id);
      const isSelected = selectedStationId === station.id;

      return {
        id: station.id,
        type: "station",
        position: { x: pos.x, y: pos.y },
        data: {
          station,
          isOnSelectedPath: isOnPath,
          isSelectedStation: isSelected,
          onSelectStation: handleSelectStation,
        },
        draggable: false,
        selectable: false,
      };
    });
  }, [stationPositions, selectedStationSet, selectedStationId, handleSelectStation]);

  // Convert sections to ReactFlow edges
  const edges = useMemo<Edge[]>(() => {
    return CANONICAL_SECTIONS.map((section) => {
      const fromPos = stationPositions[section.fromStationId] ?? { x: 0, y: 0 };
      const toPos = stationPositions[section.toStationId] ?? { x: 0, y: 0 };

      // Determine handle attachment sides
      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;

      let sourceHandle = "sR";
      let targetHandle = "tL";

      if (Math.abs(dy) > Math.abs(dx)) {
        // Vertical connection (e.g. GZB south to DDU, or ALJN south to LKO)
        if (dy > 0) {
          sourceHandle = "sB";
          targetHandle = "tT";
        } else {
          sourceHandle = "sT";
          targetHandle = "tB";
        }
      } else if (dx < 0) {
        // Right to left
        sourceHandle = "sL";
        targetHandle = "tR";
      }

      const isOnPath = pathSectionIdSet.has(section.id);

      return {
        id: section.id,
        source: section.fromStationId,
        target: section.toStationId,
        sourceHandle,
        targetHandle,
        type: "sectionEdge",
        zIndex: isOnPath ? 20 : 5,
        data: {
          section,
          isOnSelectedPath: isOnPath,
          selectedTrackId,
          selectedSectionId,
          onSelectSection: handleSelectSection,
          onSelectTrack: handleSelectTrack,
          onSelectBlock: handleSelectBlock,
        },
      };
    });
  }, [
    stationPositions,
    pathSectionIdSet,
    selectedTrackId,
    selectedSectionId,
    handleSelectSection,
    handleSelectTrack,
    handleSelectBlock,
  ]);

  const activeSection = selectedSectionId
    ? CANONICAL_SECTIONS_BY_ID[selectedSectionId] ?? null
    : null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#f6f7fb]">
      {/* TOP: Path Builder & Corridor Spine Controls */}
      <PathControls
        selectedPath={selectedPath}
        onPathChange={(newPath) => {
          setSelectedPath(newPath);
          setTimeout(() => fitView({ padding: 0.15, maxZoom: 1.25, duration: 300 }), 50);
        }}
        onSelectStation={handleSelectStation}
        onFitView={() => fitView({ padding: 0.15, maxZoom: 1.25, duration: 400 })}
      />

      {/* MAIN: ReactFlow Canvas (~80%) + Right Slide-in Inspector */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="relative h-full min-h-0 min-w-0 flex-1">
          {/* Top-left Quick Search Box */}
          <div className="absolute left-5 top-4 z-20 w-64">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                width="13"
                height="13"
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
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search station or section…"
                className="h-8 w-full rounded-xl border border-[#e3e6f0] bg-white/95 pl-8 pr-7 text-xs font-semibold text-[#171a30] shadow-sm backdrop-blur-sm placeholder:text-[#a2a7ba] focus:border-[#2e3092] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#878da1] hover:text-[#171a30]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.25 }}
            minZoom={0.4}
            maxZoom={1.8}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesUpdatable={false}
            deleteKeyCode={null}
            onPaneClick={() => {
              // Click background pane to dismiss selection
              handleCloseInspector();
            }}
          >
            <Background color="#dde1ee" gap={24} size={1} />
            <Controls position="top-right" showInteractive={false} />
          </ReactFlow>

          {/* Bottom Floating Legend */}
          <div className="absolute bottom-4 left-5 right-5 z-20 pointer-events-auto">
            <NetworkLegend />
          </div>
        </div>

        {/* RIGHT: Slide-in Section / Track Inspector */}
        {inspectorOpen && activeSection && (
          <SectionInspector
            section={activeSection}
            activeTrackId={selectedTrackId}
            activeTab={inspectorTab}
            onTabChange={setInspectorTab}
            onSelectTrack={handleSelectTrack}
            onClose={handleCloseInspector}
            onShowPlanningImpact={onShowPlanningImpact}
          />
        )}
      </div>
    </div>
  );
}

export default function NetworkDiagram({ onShowPlanningImpact }: NetworkDiagramProps) {
  return (
    <ReactFlowProvider>
      <DiagramInner onShowPlanningImpact={onShowPlanningImpact} />
    </ReactFlowProvider>
  );
}
