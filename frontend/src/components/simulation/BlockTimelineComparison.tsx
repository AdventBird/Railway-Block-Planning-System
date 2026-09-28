import { memo } from "react";
import type { TimelineBarItem } from "../../data/simulationData";

export interface BlockTimelineComparisonProps {
  ticks: string[];
  startMinute: number;
  endMinute: number;
  beforeBars: TimelineBarItem[];
  afterBars: TimelineBarItem[];
  beforeVersion?: string;
  afterVersion?: string;
}

function BlockTimelineComparison({
  ticks,
  startMinute,
  endMinute,
  beforeBars,
  afterBars,
  beforeVersion = "Before (r3)",
  afterVersion = "After (r4)",
}: BlockTimelineComparisonProps) {
  const totalMinutes = Math.max(60, endMinute - startMinute);

  const getPositionPercent = (timeStr: string) => {
    const parts = timeStr.split(":");
    let mins = parseInt(parts[0], 10) * 60 + parseInt(parts[1] || "0", 10);
    if (mins < startMinute) mins += 1440;
    const diff = Math.max(0, Math.min(totalMinutes, mins - startMinute));
    return (diff / totalMinutes) * 100;
  };

  return (
    <div className="rounded-2xl border border-[#e3e6f0] bg-white p-5 shadow-xs">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f6] pb-3">
        <h3 className="text-sm font-black tracking-tight text-[#171a30]">
          Block schedule comparison
        </h3>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#4d5468]">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-[#2e3092]" />
            <span>Maintenance job</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded bg-[#dc2626]" />
            <span>Special / secured train</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded border border-dashed border-[#dc2626] bg-[#fee2e2]" />
            <span>Deferred job</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-xs border border-dashed border-[#878da1]" />
            <span className="text-[#878da1]">{beforeVersion}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-xs border border-[#2e3092]" />
            <span className="text-[#878da1]">{afterVersion}</span>
          </span>
        </div>
      </div>

      {/* Timeline Grid */}
      <div className="mt-4 space-y-3">
        {/* Time Ticks Header */}
        <div className="relative ml-24 h-5 border-b border-[#eef0f6] font-mono text-[10px] text-[#878da1]">
          {ticks.map((t, idx) => {
            const leftPct = (idx / (ticks.length - 1)) * 100;
            return (
              <span
                key={t}
                className="absolute -translate-x-1/2"
                style={{ left: `${leftPct}%` }}
              >
                {t}
              </span>
            );
          })}
        </div>

        {/* Lane 1: Before (r3) */}
        <div className="flex items-center gap-3">
          <div className="w-20 shrink-0 font-mono text-xs font-bold text-[#626982]">
            {beforeVersion}
          </div>
          <div className="relative h-11 flex-1 rounded-xl border border-dashed border-[#c5cbe0] bg-[#fafbfe] p-1">
            {beforeBars.map((bar) => {
              const left = getPositionPercent(bar.start);
              const right = getPositionPercent(bar.end);
              const width = Math.max(3, right - left);

              return (
                <div
                  key={bar.id}
                  className="absolute top-1 bottom-1 flex items-center justify-center rounded-lg bg-[#2e3092] px-2 font-mono text-[11px] font-bold text-white shadow-xs"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                  title={`${bar.label} (${bar.start} – ${bar.end})`}
                >
                  <span className="truncate">{bar.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lane 2: After (r4) */}
        <div className="flex items-center gap-3">
          <div className="w-20 shrink-0 font-mono text-xs font-bold text-[#171a30]">
            {afterVersion}
          </div>
          <div className="relative h-11 flex-1 rounded-xl border border-[#2e3092]/40 bg-[#fafbfe] p-1">
            {afterBars.map((bar) => {
              const left = getPositionPercent(bar.start);
              const right = getPositionPercent(bar.end);
              const width = Math.max(3, right - left);

              if (bar.isDeferred) {
                return (
                  <div
                    key={bar.id}
                    className="absolute top-1 bottom-1 flex items-center justify-center rounded-lg border border-dashed border-[#dc2626] bg-[#fee2e2] px-2 font-mono text-[11px] font-bold text-[#dc2626]"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                    }}
                    title={`${bar.label} — Deferred`}
                  >
                    <span className="truncate">{bar.label}</span>
                  </div>
                );
              }

              if (bar.type === "event") {
                return (
                  <div
                    key={bar.id}
                    className="absolute top-1 bottom-1 flex items-center justify-center rounded-lg bg-[#dc2626] px-2 font-mono text-[11px] font-bold text-white shadow-xs"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                    }}
                    title={bar.label}
                  >
                    <span className="truncate">{bar.label}</span>
                  </div>
                );
              }

              return (
                <div
                  key={bar.id}
                  className="absolute top-1 bottom-1 flex items-center justify-center rounded-lg bg-[#2e3092] px-2 font-mono text-[11px] font-bold text-white shadow-xs"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                  title={bar.label}
                >
                  <span className="truncate">{bar.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(BlockTimelineComparison);
