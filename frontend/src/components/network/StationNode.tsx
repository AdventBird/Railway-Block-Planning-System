import { memo } from "react";
import type { CSSProperties } from "react";
import type { NodeProps } from "reactflow";
import { Handle, Position } from "reactflow";
import type { CanonicalStation } from "../../data/networkData";

export interface StationNodeData {
  station: CanonicalStation;
  isOnSelectedPath: boolean;
  isSelectedStation: boolean;
  onSelectStation?: (stationId: string) => void;
}

const handleStyle: CSSProperties = {
  width: 6,
  height: 6,
  background: "transparent",
  border: "none",
  pointerEvents: "none",
};

function StationNode({ data }: NodeProps) {
  const d = (data ?? {}) as StationNodeData;
  const { station, isOnSelectedPath, isSelectedStation, onSelectStation } = d;

  if (!station) return null;

  return (
    <div
      onClick={() => onSelectStation?.(station.id)}
      className={`group relative flex min-w-[148px] cursor-pointer items-center gap-3 rounded-2xl border bg-white px-3.5 py-2.5 shadow-sm transition-all duration-200 hover:shadow-md ${
        isSelectedStation
          ? "border-[#2e3092] ring-2 ring-[#2e3092]/30 shadow-md"
          : isOnSelectedPath
          ? "border-[#2e3092]/50 hover:border-[#2e3092]"
          : "border-[#e3e6f0] opacity-80 hover:opacity-100 hover:border-[#b0b7d0]"
      }`}
      title={`${station.name} (${station.code}) — Click to inspect`}
    >
      {/* 4 invisible anchor handles for clean straight edges */}
      <Handle id="sL" type="source" position={Position.Left} style={handleStyle} isConnectable={false} />
      <Handle id="sR" type="source" position={Position.Right} style={handleStyle} isConnectable={false} />
      <Handle id="sT" type="source" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle id="sB" type="source" position={Position.Bottom} style={handleStyle} isConnectable={false} />
      <Handle id="tL" type="target" position={Position.Left} style={handleStyle} isConnectable={false} />
      <Handle id="tR" type="target" position={Position.Right} style={handleStyle} isConnectable={false} />
      <Handle id="tT" type="target" position={Position.Top} style={handleStyle} isConnectable={false} />
      <Handle id="tB" type="target" position={Position.Bottom} style={handleStyle} isConnectable={false} />

      {/* Station / Junction Icon */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
          station.junction
            ? "bg-[#2e3092]/10 text-[#2e3092]"
            : "bg-[#f1f3f9] text-[#4d5468]"
        }`}
      >
        {station.junction ? (
          /* Junction / Interchange icon */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
          </svg>
        ) : (
          /* Standard station icon */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" />
          </svg>
        )}
      </div>

      {/* Station Code and Name */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[17px] font-black tracking-wide text-[#171a30]">
            {station.code}
          </span>
          {station.junction && (
            <span
              className="rounded bg-[#2e3092]/10 px-1 py-0.5 font-mono text-[8px] font-extrabold uppercase tracking-wider text-[#2e3092]"
              title="Railway Junction"
            >
              JN
            </span>
          )}
        </div>
        <div className="truncate text-[11px] font-medium text-[#626982]" title={station.name}>
          {station.name}
        </div>
      </div>
    </div>
  );
}

export default memo(StationNode);
