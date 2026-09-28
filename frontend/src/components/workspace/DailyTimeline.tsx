import { useState, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Train as TrainIcon,
} from "lucide-react";
import {
  TIMELINE_TIME_MARKS,
  computeTimelineBarGeometry,
} from "../../lib/planning/timelineLayout";
import { BlockHoverCard } from "./BlockHoverCard";
import type {
  CorridorTrackSection,
  FutureBlockWindow,
  FutureTrainMovement,
  HorizonJob,
} from "../../data/horizonData";

interface DailyTimelineProps {
  dateStr: string; // "2026-09-17"
  dateLabel: string; // "17 September 2026"
  jobsCount: number;
  blocksCount: number;
  utilization: number;
  trainImpactMinutes: number;
  sections: CorridorTrackSection[];
  trains: FutureTrainMovement[];
  blocks: FutureBlockWindow[];
  jobs: HorizonJob[];
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
  onPrevDate: () => void;
  onNextDate: () => void;
  onViewDaySummary: () => void;
  onSelectTrain?: (trainId: string) => void;
}

export function DailyTimeline({
  dateLabel,
  jobsCount,
  blocksCount,
  utilization,
  trainImpactMinutes,
  sections,
  trains,
  blocks,
  jobs,
  selectedBlockId,
  onSelectBlock,
  onPrevDate,
  onNextDate,
  onViewDaySummary,
  onSelectTrain,
}: DailyTimelineProps) {
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [hoverCardPos, setHoverCardPos] = useState<{ top: number; left: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleMouseEnterBlock = (blockId: string, event: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const containerRect = timelineRef.current.getBoundingClientRect();
    const targetRect = event.currentTarget.getBoundingClientRect();

    // Position popover relative to container
    const left = Math.max(10, Math.min(containerRect.width - 330, targetRect.left - containerRect.left));
    const top = targetRect.bottom - containerRect.top + 8;

    setHoverCardPos({ top, left });
    setHoveredBlockId(blockId);
  };

  const handleMouseLeaveBlock = () => {
    setHoveredBlockId(null);
    setHoverCardPos(null);
  };

  const hoveredBlock = blocks.find((b) => b.id === hoveredBlockId);
  const hoveredBlockJobs = hoveredBlock
    ? jobs.filter((j) => hoveredBlock.jobIds.includes(j.id))
    : [];
  const hoveredSection = hoveredBlock
    ? sections.find((s) => s.id === hoveredBlock.sectionId)
    : null;

  return (
    <div className="relative flex flex-col rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
      {/* 1. Header with Date Navigation and Summary KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef0f6] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-[#171a30]">
              Daily Plan — {dateLabel}
            </h2>
            <span className="rounded-full bg-[#eef0fa] px-2 py-0.5 font-mono text-[10px] font-bold text-[#2e3092]">
              Planned
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#878da1]">
            <span>{jobsCount} jobs</span>
            <span>·</span>
            <span>{blocksCount} blocks</span>
            <span>·</span>
            <span className="text-[#16a34a] font-bold">{utilization}% utilization</span>
            <span>·</span>
            <span className={trainImpactMinutes > 0 ? "text-[#d97706] font-bold" : "text-[#16a34a]"}>
              {trainImpactMinutes} min estimated train impact
            </span>
          </div>
        </div>

        {/* Date Navigator and Day Summary Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#e3e6f0] bg-[#f8f9fd] p-0.5">
            <button
              type="button"
              onClick={onPrevDate}
              className="rounded p-1 text-[#4d5468] hover:bg-white hover:text-[#171a30] transition-colors"
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 font-mono text-xs font-bold text-[#171a30]">{dateLabel}</span>
            <button
              type="button"
              onClick={onNextDate}
              className="rounded p-1 text-[#4d5468] hover:bg-white hover:text-[#171a30] transition-colors"
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={onViewDaySummary}
            className="rounded-lg border border-[#d9ddef] bg-white px-3 py-1.5 text-xs font-bold text-[#2e3092] hover:bg-[#eef0fa] transition-colors"
          >
            View Day Summary
          </button>
        </div>
      </div>

      {/* 2. Timeline Controls and Ruler Header */}
      <div className="mt-3 flex items-center justify-between text-xs text-[#878da1] pb-2 border-b border-[#eef0f6]">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[#171a30] text-[11px]">
          <span>Future Planning Timeline</span>
          <span className="font-mono text-[10px] text-[#878da1] font-normal">(22:00 → 08:00 IST)</span>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            className="rounded p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[10px] font-bold text-[#4d5468] hover:bg-[#f1f3f9]"
            title="Fit to Horizon"
          >
            Fit
          </button>
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[10px] font-bold text-[#4d5468] hover:bg-[#f1f3f9]"
            title="Filter Timeline"
          >
            Filters
          </button>
        </div>
      </div>

      {/* 3. Main Timeline Graphic Canvas */}
      <div ref={timelineRef} className="relative mt-2 overflow-x-auto select-none min-w-[700px]">
        {/* Time Marks Grid Header */}
        <div className="flex items-center pb-2 pl-44 pr-2 font-mono text-[10px] font-bold text-[#878da1]">
          <div className="relative w-full flex justify-between">
            {TIMELINE_TIME_MARKS.map((time) => (
              <div key={time} className="flex flex-col items-center">
                <span>{time}</span>
                <div className="h-1.5 w-[1px] bg-[#d9ddef] mt-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Sections and Track Lanes */}
        <div className="space-y-3 pb-4">
          {sections.map((sec) => {
            const isSingle = sec.lineType === "SINGLE";

            return (
              <div
                key={sec.id}
                className="rounded-lg border border-[#e3e6f0] bg-[#fafbfd] overflow-hidden"
              >
                {/* Section Header */}
                <div className="flex items-center justify-between border-b border-[#eef0f6] bg-white px-3 py-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-black text-[#171a30]">{sec.name}</span>
                    <span className="text-[10px] text-[#878da1]">
                      {sec.distanceKm} km · {isSingle ? "Single line" : "Double line"}
                    </span>
                  </div>
                  {isSingle && (
                    <span className="rounded bg-[#fffbeb] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#92400e] border border-[#fde68a]">
                      SINGLE TRACK · BOTH DIRECTIONS AFFECTED
                    </span>
                  )}
                </div>

                {/* Track Lanes */}
                <div className="divide-y divide-[#edf0f7]">
                  {sec.tracks.map((trk) => {
                    // Filter trains on this section & track
                    const trackTrains = trains.filter(
                      (t) =>
                        t.sectionId === sec.id &&
                        (isSingle ? true : t.track === trk.direction)
                    );

                    // Filter planned blocks on this section & track
                    const trackBlocks = blocks.filter(
                      (b) =>
                        b.sectionId === sec.id &&
                        (isSingle ? true : b.track === trk.direction)
                    );

                    return (
                      <div
                        key={trk.id}
                        className="flex items-center hover:bg-white transition-colors"
                      >
                        {/* Track Label on the Left */}
                        <div className="w-44 shrink-0 px-3 py-3 border-r border-[#edf0f7] bg-[#f8f9fd]">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#171a30]">
                              {trk.label}
                            </span>
                            <span className="text-[9px] font-semibold text-[#878da1] uppercase">
                              {trk.direction}
                            </span>
                          </div>
                          <div className="truncate text-[9px] text-[#878da1]" title={trk.description}>
                            {trk.description}
                          </div>
                        </div>

                        {/* Interactive Timeline Lane Canvas */}
                        <div className="relative flex-1 h-14 pl-2 pr-2">
                          {/* Vertical Hour Guidelines */}
                          <div className="absolute inset-0 flex justify-between pointer-events-none opacity-30">
                            {TIMELINE_TIME_MARKS.map((_, i) => (
                              <div key={i} className="h-full w-[1px] bg-[#d9ddef]" />
                            ))}
                          </div>

                          {/* Planned Maintenance Block Containers */}
                          {trackBlocks.map((blk) => {
                            const geo = computeTimelineBarGeometry(blk.start, blk.end);
                            const isSelected = selectedBlockId === blk.id;
                            const isHovered = hoveredBlockId === blk.id;
                            const isSanctioned = blk.id.startsWith("BLK");

                            return (
                              <div
                                key={blk.id}
                                style={{
                                  left: `${geo.leftPercent}%`,
                                  width: `${geo.widthPercent}%`,
                                }}
                                onMouseEnter={(e) => handleMouseEnterBlock(blk.id, e)}
                                onMouseLeave={handleMouseLeaveBlock}
                                onClick={() => onSelectBlock(blk.id)}
                                className={`absolute top-1.5 bottom-1.5 z-20 cursor-pointer rounded-md p-1.5 transition-all shadow-xs ${
                                  isSanctioned
                                    ? "border border-dashed border-[#64748b] bg-[#f1f5f9] text-[#334155]"
                                    : isSelected
                                      ? "border-2 border-[#2e3092] bg-[#2e3092] text-white ring-2 ring-[#2e3092]/30"
                                      : isHovered
                                        ? "border border-[#2e3092] bg-[#24266f] text-white"
                                        : "border border-[#2e3092] bg-[#2e3092] text-white hover:bg-[#24266f]"
                                }`}
                              >
                                <div className="flex h-full flex-col justify-between overflow-hidden">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono text-[10px] font-black tracking-wide truncate">
                                      {blk.id} · {blk.start}–{blk.end}
                                    </span>
                                    {isSanctioned ? (
                                      <span className="font-mono text-[8px] uppercase tracking-wider text-[#64748b] bg-white/70 px-1 rounded">
                                        Sanctioned
                                      </span>
                                    ) : (
                                      <span className="font-mono text-[8px] uppercase tracking-wider bg-white/20 px-1 rounded">
                                        {blk.minutes}m
                                      </span>
                                    )}
                                  </div>

                                  <div className="truncate text-[9px] font-medium opacity-90">
                                    {isSanctioned
                                      ? "Sanctioned Rolling Block"
                                      : `${blk.jobIds.length} jobs · ${blk.trainImpactMin}m impact`}
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {/* Future Train Movement Outlines (No visual collision) */}
                          {trackTrains.map((tr) => {
                            const geo = computeTimelineBarGeometry(tr.start, tr.end);
                            const isSpecial = tr.type === "special";
                            const isFreight = tr.type === "freight";

                            return (
                              <div
                                key={tr.id}
                                style={{
                                  left: `${geo.leftPercent}%`,
                                  width: `${geo.widthPercent}%`,
                                }}
                                onClick={() => onSelectTrain && onSelectTrain(tr.id)}
                                title={`${tr.number} ${tr.name} (${tr.start}–${tr.end}) · ${tr.note ?? ""}`}
                                className={`absolute z-10 cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-bold transition-all ${
                                  // When block is on the same track, position train above to avoid overlap
                                  trackBlocks.length > 0 ? "top-1 h-5" : "top-3.5 h-6"
                                } ${
                                  isSpecial
                                    ? "border-2 border-[#dc2626] bg-[#fef2f2] text-[#dc2626] shadow-xs"
                                    : isFreight
                                      ? "border border-[#64748b] bg-white/90 text-[#475569]"
                                      : "border border-[#16a34a] bg-white/90 text-[#166534]"
                                }`}
                              >
                                <div className="flex items-center gap-1 overflow-hidden truncate">
                                  <TrainIcon size={10} className="shrink-0" />
                                  <span className="font-mono">{tr.number}</span>
                                  <span className="truncate opacity-80">{tr.name}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hover Block Preview Popover Card */}
        {hoveredBlock && hoverCardPos && (
          <div
            onMouseEnter={() => setHoveredBlockId(hoveredBlock.id)}
            onMouseLeave={handleMouseLeaveBlock}
          >
            <BlockHoverCard
              block={hoveredBlock}
              jobs={hoveredBlockJobs}
              sectionName={hoveredSection?.name ?? "Corridor Section"}
              onSelectBlock={(id) => {
                onSelectBlock(id);
                handleMouseLeaveBlock();
              }}
              style={{
                top: `${hoverCardPos.top}px`,
                left: `${hoverCardPos.left}px`,
              }}
            />
          </div>
        )}
      </div>

      {/* Timeline Footer Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f6] pt-3 text-[10px] text-[#878da1]">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded bg-[#2e3092]" />
            <span className="font-bold text-[#171a30]">Planned Block (Container)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border border-[#16a34a] bg-[#f0fdf4]" />
            <span className="text-[#166534]">Passenger Train</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border border-[#64748b] bg-[#f8fafc]" />
            <span className="text-[#475569]">Freight Movement</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border-2 border-[#dc2626] bg-[#fef2f2]" />
            <span className="text-[#dc2626] font-bold">Special / Protected Movement</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded border border-dashed border-[#64748b] bg-[#f1f5f9]" />
            <span className="text-[#475569]">Sanctioned Block</span>
          </div>
        </div>

        <div className="font-mono text-[9px]">
          Hover block to reveal bundled jobs · Click block to inspect
        </div>
      </div>
    </div>
  );
}
