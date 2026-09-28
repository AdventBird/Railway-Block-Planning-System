import React, { useState } from "react";
import { HelpCircle, Check, X, ShieldCheck, ArrowRight } from "lucide-react";
import type { ProposedBlock, BundledJob } from "../../lib/approvalData";

interface ProposedBlocksProps {
  blocks: ProposedBlock[];
  onSelectBlock?: (blockId: string) => void;
  onNavigateToWorkspaceForBlock?: (blockId: string) => void;
}

const DEPT_BADGE_STYLE: Record<BundledJob["dept"], { bg: string; text: string; border: string }> = {
  Engineering: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  "S&T": { bg: "#fdf4ff", text: "#86198f", border: "#f5d0fe" },
  TRD: { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
};

export const ProposedBlocks: React.FC<ProposedBlocksProps> = ({
  blocks,
  onSelectBlock,
  onNavigateToWorkspaceForBlock,
}) => {
  const [activeWhyBlock, setActiveWhyBlock] = useState<ProposedBlock | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#171a30]">
            PROPOSED BLOCKS
          </h2>
          <p className="text-xs text-[#878da1]">
            System-determined future possessions and bundled maintenance activities
          </p>
        </div>
        <span className="text-xs font-semibold text-[#878da1]">
          {blocks.length} possessions
        </span>
      </div>

      {/* Grid of Proposed Blocks */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {blocks.map((block) => {
          return (
            <div
              key={block.id}
              className="flex flex-col justify-between rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-sm transition-all hover:border-[#2e3092]/30"
            >
              {/* Block Header */}
              <div>
                <div className="flex items-start justify-between gap-2 border-b border-[#f1f3f9] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-extrabold text-[#2e3092]">
                        {block.name}
                      </span>
                      <span className="text-xs font-bold text-[#171a30]">
                        {block.section} · {block.track}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs font-medium text-[#4d5468]">
                      <span className="font-mono font-semibold">{block.timeWindow}</span>
                      <span className="text-[#a2a7ba]">·</span>
                      <span>{block.durationMinutes} min</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block rounded-md bg-[#fffbeb] px-2 py-0.5 text-[10px] font-bold uppercase text-[#92400e] border border-[#fde68a]">
                      Pending approval
                    </span>
                  </div>
                </div>

                {/* Bundled Jobs List */}
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[#878da1]">
                    <span>{block.bundledJobs.length} jobs bundled</span>
                    <button
                      type="button"
                      onClick={() => setActiveWhyBlock(block)}
                      className="focus-primary inline-flex items-center gap-1 text-[11px] font-bold text-[#2e3092] hover:underline"
                    >
                      <HelpCircle size={12} />
                      <span>Why grouped?</span>
                    </button>
                  </div>

                  <div className="rounded-lg border border-[#eef0f6] bg-[#fafbfc] divide-y divide-[#eef0f6]">
                    {block.bundledJobs.map((job) => {
                      const deptStyle = DEPT_BADGE_STYLE[job.dept];
                      return (
                        <div key={job.id} className="p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] font-bold text-[#2e3092]">
                                  {job.id}
                                </span>
                                <span className="truncate text-xs font-bold text-[#171a30]">
                                  {job.title}
                                </span>
                                {job.parallel && (
                                  <span className="rounded bg-[#f1f3f9] px-1 py-0.2 text-[9px] font-semibold text-[#4d5468]">
                                    Parallel
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 truncate text-[11px] text-[#878da1]">
                                {job.asset}
                              </div>
                            </div>

                            <span
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                              style={{
                                backgroundColor: deptStyle.bg,
                                color: deptStyle.text,
                                border: `1px solid ${deptStyle.border}`,
                              }}
                            >
                              {job.dept}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Card Footer / Actions */}
              <div className="mt-4 flex items-center justify-between border-t border-[#f1f3f9] pt-3 text-xs">
                <span className="text-[11px] text-[#878da1]">
                  Single coordinated possession
                </span>

                <div className="flex items-center gap-2">
                  {onSelectBlock && (
                    <button
                      type="button"
                      onClick={() => onSelectBlock(block.id)}
                      className="focus-primary text-[11px] font-semibold text-[#4d5468] hover:text-[#171a30]"
                    >
                      Details
                    </button>
                  )}
                  {onNavigateToWorkspaceForBlock && (
                    <button
                      type="button"
                      onClick={() => onNavigateToWorkspaceForBlock(block.id)}
                      className="focus-primary inline-flex items-center gap-1 text-[11px] font-bold text-[#2e3092] hover:underline"
                    >
                      <span>Workspace</span>
                      <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* "Why grouped?" Modal / Popover */}
      {activeWhyBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div
            className="w-full max-w-lg rounded-xl border border-[#e3e6f0] bg-white p-5 shadow-xl transition-all animate-in fade-in zoom-in-95"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between border-b border-[#f1f3f9] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                  POSSESSION GROUPING REASONING
                </span>
                <h3 className="text-base font-bold text-[#171a30]">
                  Why are these {activeWhyBlock.bundledJobs.length} jobs grouped in {activeWhyBlock.name}?
                </h3>
                <p className="mt-0.5 text-xs text-[#4d5468]">
                  {activeWhyBlock.section} ({activeWhyBlock.track}) · {activeWhyBlock.timeWindow}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveWhyBlock(null)}
                className="rounded-lg p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="my-4 space-y-3">
              <div className="rounded-lg bg-[#f8fafc] p-3 text-xs leading-relaxed text-[#4d5468] border border-[#eef0f6]">
                <span className="font-semibold text-[#171a30]">Planner determination: </span>
                {activeWhyBlock.whyGrouped.summary}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#878da1]">
                  Verified compatibility checks
                </div>
                <div className="space-y-1.5">
                  {activeWhyBlock.whyGrouped.points.map((pt, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-[#171a30]">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0]">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <span>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-[#e3e6f0] bg-[#fafbfc] p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#171a30]">
                  <ShieldCheck size={14} className="text-[#2e3092]" />
                  <span>Traffic &amp; Corridor Safety</span>
                </div>
                <p className="mt-1 text-[11px] text-[#4d5468]">
                  {activeWhyBlock.whyGrouped.trafficSafety}
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-[#f1f3f9] pt-3">
              <button
                type="button"
                onClick={() => setActiveWhyBlock(null)}
                className="focus-primary rounded-lg bg-[#2e3092] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#24266f]"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
