import { memo } from "react";
import type { CSSProperties } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import type { Station } from "../types";

export interface StationNodeData {
  station: Station;
  /** Number of active blocks (blocked / maintenance) touching this junction. */
  activeBlockCount: number;
  /** True when at least one touching section is fully blocked (vs maintenance only). */
  hasBlocked: boolean;
}

/** Handles are only anchor points for edges — keep them invisible. */
const handleStyle: CSSProperties = {
  width: 4,
  height: 4,
  background: "transparent",
  border: "none",
  pointerEvents: "none",
};

function StationNode({ data }: NodeProps) {
  const d = (data ?? {}) as StationNodeData;
  const { station, activeBlockCount, hasBlocked } = d;
  const dotColor = hasBlocked ? "#dc2626" : "#d97706";

  return (
    <div
      className="relative h-16 w-40 rounded-xl border border-[#e3e6f0] bg-white px-3 py-2 shadow-[0_4px_16px_rgba(23,26,48,0.10)] transition-shadow duration-200 hover:shadow-[0_8px_24px_rgba(23,26,48,0.16)]"
      style={{ borderColor: hasBlocked ? "rgba(220,38,38,0.45)" : "#e3e6f0" }}
      title={`${station.name} (${station.code})`}
    >
      {/* Edge anchor points */}
      <Handle id="l" type="target" position={Position.Left} style={handleStyle} isConnectable={false} />
      <Handle id="r" type="source" position={Position.Right} style={handleStyle} isConnectable={false} />

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[13px] font-extrabold tracking-wider text-[#171a30]">
          {station.code}
        </span>
        {station.junction && (
          <span className="rounded border border-[#d97706]/40 bg-[#fffbeb] px-1 text-[8px] font-bold tracking-wider text-[#d97706]">
            JN
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-[11px] font-medium text-[#4d5468]" title={station.name}>
        {station.name}
      </div>

      {/* Active block indicator — red when a line is blocked, amber for maintenance-only */}
      {activeBlockCount > 0 && (
        <div
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border bg-white px-1 text-[10px] font-bold shadow-sm"
          style={{
            borderColor: hasBlocked ? "rgba(220,38,38,0.6)" : "rgba(217,119,6,0.6)",
            color: dotColor,
          }}
          title={`${activeBlockCount} active block${activeBlockCount > 1 ? "s" : ""} at ${station.name}`}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
              style={{ background: dotColor }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: dotColor }}
            />
          </span>
          <span className="ml-1">{activeBlockCount}</span>
        </div>
      )}
    </div>
  );
}

export default memo(StationNode);