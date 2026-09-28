export default function NetworkLegend() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-6 rounded-xl border border-[#e3e6f0] bg-white/95 px-4 py-2 text-[11px] font-medium text-[#4d5468] shadow-sm backdrop-blur-sm">
      {/* Track Status */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] font-extrabold uppercase tracking-wider text-[#878da1]">
          Track Status
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
            <span>Clear</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2563eb]" />
            <span>Occupied (train)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
            <span>Blocked</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#d97706]" />
            <span>Maintenance</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 border-t-2 border-dashed border-[#f59e0b]" />
            <span>Restriction</span>
          </span>
        </div>
      </div>

      {/* Line Type */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] font-extrabold uppercase tracking-wider text-[#878da1]">
          Line Type
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="flex flex-col gap-[2px]">
              <span className="h-[2px] w-3.5 bg-[#4d5468]" />
              <span className="h-[2px] w-3.5 bg-[#4d5468]" />
            </span>
            <span>Double line</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 border-t border-dashed border-[#4d5468]" />
            <span>Single line</span>
          </span>
        </div>
      </div>

      {/* Directions */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] font-extrabold uppercase tracking-wider text-[#878da1]">
          Directions
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="font-mono font-bold text-[#171a30]">→</span>
            <span>UP (Origin → Destination)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="font-mono font-bold text-[#171a30]">←</span>
            <span>DOWN (Destination → Origin)</span>
          </span>
        </div>
      </div>

      {/* Station Type */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] font-extrabold uppercase tracking-wider text-[#878da1]">
          Station Type
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="flex h-3 w-3 items-center justify-center rounded-sm border border-[#626982]" />
            <span>Station</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="flex h-3 w-3 items-center justify-center rounded bg-[#2e3092]/15 text-[8px] font-bold text-[#2e3092]">
              JN
            </span>
            <span>Junction</span>
          </span>
        </div>
      </div>
    </div>
  );
}
