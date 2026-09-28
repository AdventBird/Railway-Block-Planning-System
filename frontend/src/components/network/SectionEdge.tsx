import { memo, useState } from "react";
import type { EdgeProps } from "reactflow";
import { EdgeLabelRenderer } from "reactflow";
import type { CanonicalSection, CanonicalTrack } from "../../data/networkData";

export interface SectionEdgeData {
  section: CanonicalSection;
  isOnSelectedPath: boolean;
  selectedTrackId: string | null;
  selectedSectionId: string | null;
  onSelectSection?: (sectionId: string) => void;
  onSelectTrack?: (trackId: string, direction: "UP" | "DOWN" | "BOTH") => void;
  onSelectBlock?: (blockId: string, sectionId: string, trackId: string) => void;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  clear: "#16a34a",
  occupied: "#2563eb",
  blocked: "#dc2626",
  maintenance: "#d97706",
  caution: "#f59e0b",
};

function SectionEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const d = (data ?? {}) as SectionEdgeData;
  const {
    section,
    isOnSelectedPath,
    selectedTrackId,
    selectedSectionId,
    onSelectSection,
    onSelectTrack,
    onSelectBlock,
  } = d;

  const [hoveredTrack, setHoveredTrack] = useState<string | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

  if (!section) return null;

  const isSectionSelected = selectedSectionId === section.id;
  const isDouble = section.lineType === "DOUBLE";

  // Perpendicular vector for offset
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  // Midpoints
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  // Dim non-selected path sections when a path is active
  const edgeOpacity = isOnSelectedPath ? 1 : 0.42;

  const upTrack = section.tracks.find((t) => t.direction === "UP") || section.tracks[0];
  const dnTrack = section.tracks.find((t) => t.direction === "DOWN") || section.tracks[1];
  const singleTrack = section.tracks[0];

  const upColor = STATUS_COLOR_MAP[upTrack?.status ?? "clear"];
  const dnColor = STATUS_COLOR_MAP[dnTrack?.status ?? "clear"];
  const singleColor = STATUS_COLOR_MAP[singleTrack?.status ?? "clear"];

  const isUpSelected = selectedTrackId === upTrack?.id;
  const isDnSelected = selectedTrackId === dnTrack?.id;
  const isSingleSelected = selectedTrackId === singleTrack?.id;

  // Offsets in px for UP and DOWN tracks
  const OFFSET = 12;

  // UP endpoints
  const sX_up = sourceX + nx * -OFFSET;
  const sY_up = sourceY + ny * -OFFSET;
  const tX_up = targetX + nx * -OFFSET;
  const tY_up = targetY + ny * -OFFSET;

  // DOWN endpoints
  const sX_dn = sourceX + nx * OFFSET;
  const sY_dn = sourceY + ny * OFFSET;
  const tX_dn = targetX + nx * OFFSET;
  const tY_dn = targetY + ny * OFFSET;

  // Positions for labels
  const upLabelX = midX + nx * -OFFSET;
  const upLabelY = midY + ny * -OFFSET;

  const dnLabelX = midX + nx * OFFSET;
  const dnLabelY = midY + ny * OFFSET;

  const distBadgeX = midX + nx * -(OFFSET + 18);
  const distBadgeY = midY + ny * -(OFFSET + 18);

  const renderBlockMarker = (track: CanonicalTrack, posX: number, posY: number) => {
    if (!track.plannedBlock) return null;
    const block = track.plannedBlock;
    const isHovered = hoveredBlock === block.blockId;
    const badgeColor =
      track.status === "blocked" ? "#dc2626" : track.status === "maintenance" ? "#d97706" : "#f59e0b";

    return (
      <div
        className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${posX}px`,
          top: `${posY}px`,
          zIndex: 35,
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectBlock?.(block.blockId, section.id, track.id);
            onSelectTrack?.(track.id, track.direction);
          }}
          onMouseEnter={() => setHoveredBlock(block.blockId)}
          onMouseLeave={() => setHoveredBlock(null)}
          className="group relative flex items-center justify-center rounded-md border border-white px-2 py-0.5 shadow-sm transition-transform duration-150 hover:scale-110 active:scale-95"
          style={{ background: badgeColor }}
          title={`Click to inspect ${block.blockId} on ${section.name}`}
        >
          <span className="font-mono text-[10px] font-black tracking-wider text-white">
            {block.blockId}
          </span>

          {/* Interactive Tooltip on hover */}
          {isHovered && (
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-lg border border-[#e3e6f0] bg-white p-2.5 shadow-xl transition-all">
              <div className="flex items-center justify-between gap-1.5 border-b border-[#eef0f6] pb-1.5">
                <span className="font-mono text-[11px] font-extrabold text-[#171a30]">
                  {block.blockId}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white"
                  style={{ background: badgeColor }}
                >
                  {track.status}
                </span>
              </div>
              <div className="mt-1 text-[10px] font-semibold text-[#4d5468]">
                {section.name} · {track.direction} Track
              </div>
              <div className="mt-0.5 font-mono text-[9px] text-[#626982]">
                {block.startTime} – {block.endTime} ({block.duration})
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] font-bold text-[#2e3092]">
                <span>{block.jobsCount} jobs</span>
                <span>{block.expectedImpact}</span>
              </div>
            </div>
          )}
        </button>
      </div>
    );
  };

  return (
    <>
      <g
        style={{ opacity: edgeOpacity, transition: "opacity 200ms ease" }}
        className="pointer-events-auto cursor-pointer"
        onClick={() => onSelectSection?.(section.id)}
      >
        {isDouble ? (
          <>
            {/* UP TRACK */}
            <g
              onClick={(e) => {
                e.stopPropagation();
                onSelectTrack?.(upTrack.id, "UP");
              }}
              onMouseEnter={() => setHoveredTrack("UP")}
              onMouseLeave={() => setHoveredTrack(null)}
            >
              {/* Highlight Halo if UP track or section selected */}
              {(isUpSelected || isSectionSelected || hoveredTrack === "UP") && (
                <line
                  x1={sX_up}
                  y1={sY_up}
                  x2={tX_up}
                  y2={tY_up}
                  stroke="#2e3092"
                  strokeWidth={isUpSelected ? 12 : 8}
                  strokeLinecap="round"
                  opacity={isUpSelected ? 0.35 : 0.18}
                />
              )}

              {/* UP Track Line */}
              <line
                x1={sX_up}
                y1={sY_up}
                x2={tX_up}
                y2={tY_up}
                stroke={upColor}
                strokeWidth={isUpSelected ? 5.5 : 4}
                strokeLinecap="round"
                strokeDasharray={
                  upTrack.status === "caution" || upTrack.status === "maintenance"
                    ? "8 5"
                    : undefined
                }
              />

              {/* Wide transparent hit area */}
              <line
                x1={sX_up}
                y1={sY_up}
                x2={tX_up}
                y2={tY_up}
                stroke="transparent"
                strokeWidth={18}
              />
            </g>

            {/* DOWN TRACK */}
            <g
              onClick={(e) => {
                e.stopPropagation();
                onSelectTrack?.(dnTrack.id, "DOWN");
              }}
              onMouseEnter={() => setHoveredTrack("DOWN")}
              onMouseLeave={() => setHoveredTrack(null)}
            >
              {/* Highlight Halo if DOWN track selected */}
              {(isDnSelected || isSectionSelected || hoveredTrack === "DOWN") && (
                <line
                  x1={sX_dn}
                  y1={sY_dn}
                  x2={tX_dn}
                  y2={tY_dn}
                  stroke="#2e3092"
                  strokeWidth={isDnSelected ? 12 : 8}
                  strokeLinecap="round"
                  opacity={isDnSelected ? 0.35 : 0.18}
                />
              )}

              {/* DOWN Track Line */}
              <line
                x1={sX_dn}
                y1={sY_dn}
                x2={tX_dn}
                y2={tY_dn}
                stroke={dnColor}
                strokeWidth={isDnSelected ? 5.5 : 4}
                strokeLinecap="round"
                strokeDasharray={
                  dnTrack.status === "caution" || dnTrack.status === "maintenance"
                    ? "8 5"
                    : undefined
                }
              />

              {/* Wide transparent hit area */}
              <line
                x1={sX_dn}
                y1={sY_dn}
                x2={tX_dn}
                y2={tY_dn}
                stroke="transparent"
                strokeWidth={18}
              />
            </g>
          </>
        ) : (
          /* SINGLE TRACK */
          <g
            onClick={(e) => {
              e.stopPropagation();
              onSelectTrack?.(singleTrack.id, "BOTH");
            }}
            onMouseEnter={() => setHoveredTrack("SINGLE")}
            onMouseLeave={() => setHoveredTrack(null)}
          >
            {(isSingleSelected || isSectionSelected || hoveredTrack === "SINGLE") && (
              <line
                x1={sourceX}
                y1={sourceY}
                x2={targetX}
                y2={targetY}
                stroke="#2e3092"
                strokeWidth={12}
                strokeLinecap="round"
                opacity={0.3}
              />
            )}
            <line
              x1={sourceX}
              y1={sourceY}
              x2={targetX}
              y2={targetY}
              stroke={singleColor}
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeDasharray="6 4"
            />
            <line
              x1={sourceX}
              y1={sourceY}
              x2={targetX}
              y2={targetY}
              stroke="transparent"
              strokeWidth={20}
            />
          </g>
        )}
      </g>

      {/* HTML OVERLAYS & LABELS VIA EdgeLabelRenderer */}
      <EdgeLabelRenderer>
        {/* Distance Badge */}
        <div
          className="nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${isDouble ? distBadgeX : midX}px`,
            top: `${isDouble ? distBadgeY : midY - 18}px`,
            zIndex: 10,
            opacity: edgeOpacity,
          }}
          onClick={() => onSelectSection?.(section.id)}
        >
          <span className="cursor-pointer whitespace-nowrap rounded-md border border-[#e3e6f0] bg-white/95 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#626982] shadow-sm backdrop-blur-sm transition-colors hover:border-[#2e3092] hover:text-[#2e3092]">
            {section.distanceKm} km
          </span>
        </div>

        {isDouble ? (
          <>
            {/* UP Track Label & Direction */}
            <div
              className="nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${upLabelX}px`,
                top: `${upLabelY - 11}px`,
                zIndex: 10,
                opacity: edgeOpacity,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTrack?.(upTrack.id, "UP");
              }}
            >
              <span className="flex items-center gap-1 font-mono text-[8px] font-extrabold tracking-wider text-[#626982] transition-colors hover:text-[#171a30]">
                UP →
              </span>
            </div>

            {/* DOWN Track Label & Direction */}
            <div
              className="nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${dnLabelX}px`,
                top: `${dnLabelY + 11}px`,
                zIndex: 10,
                opacity: edgeOpacity,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTrack?.(dnTrack.id, "DOWN");
              }}
            >
              <span className="flex items-center gap-1 font-mono text-[8px] font-extrabold tracking-wider text-[#626982] transition-colors hover:text-[#171a30]">
                ← DOWN
              </span>
            </div>

            {/* UP Planned Block Marker */}
            {renderBlockMarker(upTrack, upLabelX, upLabelY)}

            {/* DOWN Planned Block Marker */}
            {renderBlockMarker(dnTrack, dnLabelX, dnLabelY)}
          </>
        ) : (
          /* Single Track Direction & Marker */
          <>
            <div
              className="nodrag nopan pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${midX}px`,
                top: `${midY + 12}px`,
                zIndex: 10,
                opacity: edgeOpacity,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectTrack?.(singleTrack.id, "BOTH");
              }}
            >
              <span className="font-mono text-[8px] font-extrabold tracking-wider text-[#626982]">
                UP → / ← DOWN
              </span>
            </div>
            {renderBlockMarker(singleTrack, midX, midY)}
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(SectionEdge);
