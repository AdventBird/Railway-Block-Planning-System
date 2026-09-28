import { useState } from "react";
import {
  CheckCircle2,
  Layers,
  Split,
  FileCheck2,
} from "lucide-react";
import { Button, TierChip } from "../ui";
import type { FutureBlockWindow, HorizonJob } from "../../data/horizonData";

interface BlockInspectorProps {
  block: FutureBlockWindow | null;
  jobs: HorizonJob[];
  sectionName: string;
  onModify: (blockId: string) => void;
  onViewAlternatives: (blockId: string) => void;
  onApprove: (blockId: string) => void;
}

type TabKey = "overview" | "jobs" | "why" | "alternatives";

export function BlockInspector({
  block,
  jobs,
  sectionName,
  onModify,
  onViewAlternatives,
  onApprove,
}: BlockInspectorProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  if (!block) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-[#e3e6f0] bg-white p-6 text-center shadow-xs">
        <Layers size={32} className="text-[#cbd5e1] mb-2" />
        <h3 className="text-sm font-bold text-[#171a30]">No Block Selected</h3>
        <p className="mt-1 text-xs text-[#878da1] max-w-[200px]">
          Click any block on the timeline to inspect its constraints, jobs, and reasoning.
        </p>
      </div>
    );
  }

  const departments = [...new Set(jobs.map((j) => j.dept))];

  return (
    <div className="flex flex-col rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
      {/* Header */}
        <div className="border-b border-[#eef0f6] pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[#878da1]">
                  Selected Block:
                </span>
                <span className="font-mono text-base font-black text-[#2e3092]">{block.id}</span>
              </div>
              <h2 className="text-sm font-extrabold text-[#171a30] mt-0.5">
                {sectionName} · {block.track} Track
              </h2>
              <div className="font-mono text-xs font-bold text-[#4d5468] mt-0.5">
                {block.start} – {block.end} ({block.minutes} min)
              </div>
            </div>

            <span className="rounded-full bg-[#f0fdf4] px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#166534] border border-[#bbf7d0]">
              Recommended
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-3 flex gap-1 border-b border-[#eef0f6] -mb-[1px]" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              className={`pb-2 text-xs font-bold transition-colors ${
                activeTab === "overview"
                  ? "border-b-2 border-[#2e3092] text-[#2e3092]"
                  : "text-[#878da1] hover:text-[#171a30]"
              }`}
            >
              Overview
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "jobs"}
              onClick={() => setActiveTab("jobs")}
              className={`pb-2 text-xs font-bold transition-colors ${
                activeTab === "jobs"
                  ? "border-b-2 border-[#2e3092] text-[#2e3092]"
                  : "text-[#878da1] hover:text-[#171a30]"
              }`}
            >
              Jobs ({jobs.length})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "why"}
              onClick={() => setActiveTab("why")}
              className={`pb-2 text-xs font-bold transition-colors ${
                activeTab === "why"
                  ? "border-b-2 border-[#2e3092] text-[#2e3092]"
                  : "text-[#878da1] hover:text-[#171a30]"
              }`}
            >
              Why this block?
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "alternatives"}
              onClick={() => setActiveTab("alternatives")}
              className={`pb-2 text-xs font-bold transition-colors ${
                activeTab === "alternatives"
                  ? "border-b-2 border-[#2e3092] text-[#2e3092]"
                  : "text-[#878da1] hover:text-[#171a30]"
              }`}
            >
              Alternatives
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="thin-scroll mt-3 max-h-[300px] overflow-y-auto pr-1">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-3">
              <div className="divide-y divide-[#eef0f6] text-xs">
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878da1] font-semibold">Section</span>
                  <span className="font-bold text-[#171a30]">{sectionName}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878da1] font-semibold">Track & Direction</span>
                  <span className="font-bold text-[#171a30]">
                    {block.track} (Direction: {block.track === "UP" ? "Origin → Destination" : "Destination → Origin"})
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878da1] font-semibold">Block Type</span>
                  <span className="font-semibold text-[#171a30]">{block.blockType}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878da1] font-semibold">Possession Duration</span>
                  <span className="font-mono font-bold text-[#2e3092]">{block.minutes} minutes</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878da1] font-semibold">Jobs Bundled</span>
                  <span className="font-semibold text-[#171a30]">
                    {jobs.length} ({departments.join(", ") || "Sanctioned"})
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878da1] font-semibold">Train Impact</span>
                  <span className="font-bold text-[#d97706]">{block.impactSummary}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#878da1] font-semibold">Conflicts</span>
                  <span className="flex items-center gap-1 font-bold text-[#16a34a]">
                    <CheckCircle2 size={13} />
                    None
                  </span>
                </div>
              </div>

              {/* Feasibility Checks Checklist */}
              <div className="rounded-lg border border-[#e3e6f0] bg-[#f8f9fd] p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#171a30]">
                    Block Feasibility
                  </span>
                  <span className="font-mono text-[10px] font-bold text-[#16a34a]">
                    {block.feasibilityChecks.filter((c) => c.satisfied).length} /{" "}
                    {block.feasibilityChecks.length} constraints satisfied
                  </span>
                </div>

                <div className="space-y-1">
                  {block.feasibilityChecks.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-[#4d5468]">
                      <CheckCircle2 size={12} className="text-[#16a34a] shrink-0" />
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* JOBS TAB */}
          {activeTab === "jobs" && (
            <div className="space-y-2">
              {jobs.map((j) => (
                <div
                  key={j.id}
                  className="rounded-lg border border-[#e3e6f0] bg-[#fafbfd] p-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#2e3092]">{j.id}</span>
                        <span className="font-semibold text-[#171a30]">{j.title}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#878da1]">
                        {j.dept} · {j.minutes} min duration
                      </div>
                    </div>
                    <TierChip tier={j.tier} compact />
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-[#eef0f6] pt-1.5 text-[11px]">
                    <span className="text-[#878da1]">Scheduled window:</span>
                    <span className="font-mono font-bold text-[#171a30]">
                      {j.startTime ?? block.start} – {j.endTime ?? block.end}
                    </span>
                  </div>

                  {j.parallel && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-[#16a34a]">
                      <Split size={12} />
                      <span>Parallel execution under same protection</span>
                    </div>
                  )}

                  {j.resources.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {j.resources.map((r) => (
                        <span
                          key={r}
                          className="rounded bg-[#f1f3f9] px-1.5 py-0.5 font-mono text-[9px] text-[#4d5468]"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {jobs.length === 0 && (
                <p className="text-center text-xs text-[#878da1] py-4 italic">
                  This block is an already-sanctioned rolling envelope.
                </p>
              )}
            </div>
          )}

          {/* WHY THIS BLOCK? TAB */}
          {activeTab === "why" && (
            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-[#eef0fa] p-3 text-[#171a30]">
                <div className="font-bold text-[#2e3092] mb-1">Planner Rationale</div>
                <p className="text-[11px] leading-relaxed text-[#4d5468]">
                  The automated CP-SAT solver placed this block based on mathematical optimization
                  against network constraints:
                </p>
              </div>

              <div className="space-y-1.5 pl-1">
                {block.whySummary.map((reason, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] leading-snug text-[#171a30]">
                    <CheckCircle2 size={13} className="text-[#16a34a] shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ALTERNATIVES TAB */}
          {activeTab === "alternatives" && (
            <div className="space-y-2 text-xs">
              <div className="rounded-lg border border-[#e3e6f0] bg-[#fafbfd] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#171a30]">Shift Block Window +30m</span>
                  <span className="font-mono text-[10px] text-[#d97706]">+15m train impact</span>
                </div>
                <div className="mt-1 text-[11px] text-[#878da1]">
                  01:30 – 04:30 (180 min) · Conflicts with early morning freight release FT-882
                </div>
              </div>

              <div className="rounded-lg border border-[#e3e6f0] bg-[#fafbfd] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#171a30]">Next Day Window (18 Sep)</span>
                  <span className="font-mono text-[10px] text-[#16a34a]">0m train impact</span>
                </div>
                <div className="mt-1 text-[11px] text-[#878da1]">
                  01:00 – 04:00 (180 min) · Natural traffic gap available
                </div>
              </div>
            </div>
          )}
        </div>

      {/* Action Buttons */}
      <div className="mt-4 border-t border-[#eef0f6] pt-3">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Button variant="secondary" onClick={() => onModify(block.id)}>
            Modify Block
          </Button>
          <Button variant="secondary" onClick={() => onViewAlternatives(block.id)}>
            View Alternatives
          </Button>
        </div>

        <Button
          variant="primary"
          onClick={() => onApprove(block.id)}
          className="w-full flex items-center justify-center gap-1.5 py-2"
        >
          <FileCheck2 size={14} />
          <span>Approve Block</span>
        </Button>
      </div>
    </div>
  );
}
