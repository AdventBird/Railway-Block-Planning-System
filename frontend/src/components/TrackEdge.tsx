import { memo, useState } from "react";
import type { CSSProperties } from "react";
import type { EdgeProps } from "reactflow";
import { EdgeLabelRenderer, getBezierPath } from "reactflow";
import type { TrackSection } from "../types";
import { HIGHLIGHT_COLOR, STATUS_META } from "./statusStyles";

export type EdgeVisualState = "normal" | "highlight" | "dimmed";

export interface TrackEdgeData {
  section: TrackSection;
  /** Perpendicular lane offset in px: 0 = single, -9 = UP lane, +9 = DOWN lane. */
  laneOffset: number;
  visualState: EdgeVisualState;
  /** Lets the edge's own label chip select the section on click. */
  onSelect?: (sectionId: string) => void;
}

function TrackEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const d = (data ?? {}) as TrackEdgeData;
  const section: TrackSection = d.section;
  const meta = STATUS_META[section.status];
  const laneOffset = d.laneOffset ?? 0;
  const visual = d.visualState ?? "normal";
  const isDim = visual === "dimmed";
  const isHi = visual === "highlight";

  // Offset both endpoints perpendicular to the section direction so UP/DOWN
  // pairs render as two parallel lines instead of overlapping.
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const sx = sourceX + nx * laneOffset;
  const sy = sourceY + ny * laneOffset;
  const tx = targetX + nx * laneOffset;
  const ty = targetY + ny * laneOffset;

  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });

  const mainWidth = isHi ? 4 : section.status === "occupied" ? 3.25 : 3;
  const opacity = isDim ? 0.35 : 1;
  const shortLabel = section.line === "UP" ? "UP" : section.line === "DOWN" ? "DN" : "";

  const chipStyle: CSSProperties = {
    borderColor: hovered ? meta.color : "#e3e6f0",
    color: hovered ? meta.color : "#4d5468",
    background: "rgba(255,255,255,0.95)",
    boxShadow: "0 2px 8px rgba(23,26,48,0.10)",
  };

  return (
    <>
      <g
        style={{ opacity, transition: "opacity 200ms ease" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Selected: thick primary halo + glow */}
        {isHi && (
          <>
            <path
              d={path}
              stroke={HIGHLIGHT_COLOR}
              strokeWidth={16}
              strokeLinecap="round"
              fill="none"
              opacity={0.18}
              style={{ pointerEvents: "none" }}
            />
            <path
              d={path}
              stroke={HIGHLIGHT_COLOR}
              strokeWidth={7}
              strokeLinecap="round"
              fill="none"
              opacity={0.45}
              style={{ pointerEvents: "none" }}
            />
          </>
        )}

        {/* Blocked: soft pulsing under-glow */}
        {meta.pulse && (
          <path
            d={path}
            stroke={meta.color}
            strokeWidth={12}
            strokeLinecap="round"
            fill="none"
            className="track-edge-pulse"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Main track line — dashed with marching dashes for maintenance */}
        <path
          d={path}
          stroke={meta.color}
          strokeWidth={mainWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={meta.dashed ? "12 8" : undefined}
          className={meta.dashed ? "track-edge-dashflow" : undefined}
          style={{ pointerEvents: "none" }}
        />

        {/* Wide invisible hit area for hover / click */}
        <path
          d={path}
          stroke="transparent"
          strokeWidth={18}
          fill="none"
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
        />
      </g>

      <EdgeLabelRenderer>
        {(hovered || shortLabel) && (
          <div
            className="nodrag nopan absolute"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity,
              transition: "opacity 200ms ease",
            }}
          >
            <div
              className="pointer-events-auto flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-[2px] font-mono text-[10px] font-bold backdrop-blur-sm transition-colors duration-200"
              style={chipStyle}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onClick={() => d.onSelect?.(section.id)}
              title={section.name}
            >
              {hovered ? (
                <>
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: meta.color }}
                  />
                  <span className="whitespace-nowrap">
                    {section.name} · {meta.label}
                  </span>
                </>
              ) : (
                <span className="tracking-wider">{shortLabel}</span>
              )}
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(TrackEdge);