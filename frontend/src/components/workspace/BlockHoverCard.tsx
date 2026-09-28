import { CheckCircle2, Clock, Users, ArrowRight } from "lucide-react";
import { TierChip } from "../ui";
import type { FutureBlockWindow, HorizonJob } from "../../data/horizonData";

interface BlockHoverCardProps {
  block: FutureBlockWindow;
  jobs: HorizonJob[];
  sectionName: string;
  onSelectBlock: (blockId: string) => void;
  style?: React.CSSProperties;
}

export function BlockHoverCard({
  block,
  jobs,
  sectionName,
  onSelectBlock,
  style,
}: BlockHoverCardProps) {
  const departments = [...new Set(jobs.map((j) => j.dept))];

  return (
    <div
      style={style}
      className="absolute z-50 w-80 rounded-xl border border-[#c4c9e2] bg-white p-3.5 shadow-xl animate-in fade-in zoom-in-95 duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-[#eef0f6] pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-black text-[#2e3092]">{block.id}</span>
            <span className="text-xs font-bold text-[#171a30]">
              · {sectionName} · {block.track}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] font-bold text-[#4d5468]">
            {block.start} – {block.end} ({block.minutes} min)
          </div>
        </div>

        <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#166534] border border-[#bbf7d0]">
          Recommended
        </span>
      </div>

      {/* Quick Indicators */}
      <div className="my-2.5 flex items-center justify-between rounded-lg bg-[#f8f9fd] px-2.5 py-1.5 text-xs text-[#4d5468]">
        <span className="flex items-center gap-1 font-semibold text-[#171a30]">
          <CheckCircle2 size={13} className="text-[#16a34a]" />
          <span>{jobs.length} jobs</span>
        </span>

        <span className="flex items-center gap-1">
          <Users size={13} className="text-[#878da1]" />
          <span>{departments.length} depts</span>
        </span>

        <span className="flex items-center gap-1">
          <Clock size={13} className="text-[#878da1]" />
          <span>{block.trainImpactMin} min impact</span>
        </span>
      </div>

      {/* Jobs in this block list */}
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
          Jobs in this block
        </div>

        <div className="space-y-1.5">
          {jobs.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between rounded-md border border-[#eef0f6] bg-[#fafbfd] px-2 py-1.5 text-[11px]"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-[#2e3092]">{j.id}</span>
                  <span className="truncate font-semibold text-[#171a30]" title={j.title}>
                    {j.title}
                  </span>
                </div>
                <div className="font-mono text-[9px] text-[#878da1]">
                  {j.startTime ?? block.start} – {j.endTime ?? block.end}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <TierChip tier={j.tier} compact />
                <span className="rounded bg-[#f1f3f9] px-1 font-mono text-[9px] font-bold text-[#4d5468]">
                  {j.dept === "Engineering" ? "ENG" : j.dept === "S&T" ? "S&T" : "TRD"}
                </span>
              </div>
            </div>
          ))}

          {jobs.length === 0 && (
            <div className="rounded p-2 text-center text-xs italic text-[#878da1]">
              Sanctioned possession envelope.
            </div>
          )}
        </div>
      </div>

      {/* View block details link */}
      <button
        type="button"
        onClick={() => onSelectBlock(block.id)}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2e3092]/30 bg-[#eef0fa] py-1.5 text-xs font-bold text-[#2e3092] hover:bg-[#2e3092] hover:text-white transition-colors"
      >
        <span>View block details</span>
        <ArrowRight size={13} />
      </button>
    </div>
  );
}
