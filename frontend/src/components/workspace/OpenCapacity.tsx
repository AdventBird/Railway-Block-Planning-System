import { ArrowRight } from "lucide-react";
import { ACTIONABLE_OPEN_CAPACITY } from "../../data/horizonData";

interface OpenCapacityProps {
  onSelectBlock: (blockId: string) => void;
}

export function OpenCapacity({ onSelectBlock }: OpenCapacityProps) {
  const totalFree = ACTIONABLE_OPEN_CAPACITY.reduce((sum, item) => sum + item.freeMinutes, 0);

  return (
    <div className="flex flex-col rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
      <div>
        <div className="flex items-center justify-between border-b border-[#eef0f6] pb-2.5">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#171a30]">
              Open Capacity & Opportunities
            </h3>
            <span className="font-mono text-xs font-bold text-[#16a34a]">
              · {totalFree} min total free
            </span>
          </div>
          <span className="text-[10px] text-[#878da1]">Actionable gap analysis</span>
        </div>

        <div className="mt-2 space-y-2.5">
          {ACTIONABLE_OPEN_CAPACITY.map((item) => (
            <div
              key={item.blockId}
              className="rounded-lg border border-[#e3e6f0] bg-[#fafbfd] p-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-[#171a30]">
                    <span className="font-mono text-[#2e3092]">{item.blockId}</span>
                    <span>· {item.sectionName}</span>
                    <span className="font-mono text-[10px] text-[#878da1]">({item.trackLabel})</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#4d5468]">
                    <strong className="text-[#16a34a] font-mono">{item.freeMinutes} min</strong> available of {item.totalMinutes} min ({item.utilizationPct}% utilized)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectBlock(item.blockId)}
                  className="flex items-center gap-1 rounded border border-[#2e3092]/30 bg-white px-2.5 py-1 text-xs font-bold text-[#2e3092] hover:bg-[#eef0fa] transition-colors"
                >
                  <span>View</span>
                  <ArrowRight size={12} />
                </button>
              </div>

              {/* Candidate jobs preview */}
              <div className="mt-2 border-t border-[#eef0f6] pt-1.5">
                <div className="flex items-center justify-between text-[10px] text-[#878da1] mb-1">
                  <span>Candidate jobs for this window:</span>
                  <span className="font-bold text-[#2e3092]">{item.candidateJobs.length} eligible</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {item.candidateJobs.map((cj) => (
                    <span
                      key={cj.id}
                      className="rounded bg-white border border-[#e3e6f0] px-1.5 py-0.5 font-mono text-[9px] text-[#4d5468]"
                      title={`${cj.id}: ${cj.title} (${cj.minutes}m)`}
                    >
                      {cj.id} ({cj.minutes}m)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-[#eef0f6] pt-2 text-[10px] text-[#878da1] text-right font-mono">
        All candidates validated against electrical & track isolation
      </div>
    </div>
  );
}
