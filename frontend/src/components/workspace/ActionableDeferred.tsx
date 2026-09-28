import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { TierChip, Button } from "../ui";
import { formatJobDeadline } from "../../data/jobsData";
import {
  ALTERNATIVE_WINDOWS_MAP,
  type FeasibleAlternativeWindow,
  type HorizonJob,
} from "../../data/horizonData";

interface ActionableDeferredProps {
  deferredJobs: HorizonJob[];
  onOpenReasonDrawer: (jobId: string) => void;
  onApplyAlternative: (jobId: string, alt: FeasibleAlternativeWindow) => void;
}

type DeferralFilter =
  | "all"
  | "priority"
  | "train"
  | "resource"
  | "isolation"
  | "incompatible";

const DEFER_FILTERS: { id: DeferralFilter; label: string }[] = [
  { id: "all", label: "All Deferred" },
  { id: "priority", label: "Safety/Priority" },
  { id: "train", label: "Train Conflict" },
  { id: "resource", label: "Resource Conflict" },
  { id: "isolation", label: "Isolation" },
  { id: "incompatible", label: "Incompatible" },
];

export function ActionableDeferred({
  deferredJobs,
  onOpenReasonDrawer,
  onApplyAlternative,
}: ActionableDeferredProps) {
  const [filter, setFilter] = useState<DeferralFilter>("all");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [previewAlt, setPreviewAlt] = useState<{
    job: HorizonJob;
    alt: FeasibleAlternativeWindow;
  } | null>(null);

  // Group counts by reason
  const trainConflictCount = deferredJobs.filter(
    (j) => j.reason?.toLowerCase().includes("train")
  ).length;
  const resourceConflictCount = deferredJobs.filter(
    (j) => j.reason?.toLowerCase().includes("resource") || j.reason?.toLowerCase().includes("crane")
  ).length;
  const windowConflictCount = deferredJobs.filter(
    (j) => j.reason?.toLowerCase().includes("window") || j.reason?.toLowerCase().includes("priority")
  ).length;

  const filteredJobs = deferredJobs.filter((j) => {
    if (filter === "all") return true;
    if (filter === "priority") return j.tier >= 0 && j.tier <= 2;
    if (filter === "train") return j.reason?.toLowerCase().includes("train");
    if (filter === "resource")
      return j.reason?.toLowerCase().includes("resource") || j.reason?.toLowerCase().includes("crane");
    if (filter === "isolation") return j.reason?.toLowerCase().includes("isolation");
    if (filter === "incompatible") return j.reason?.toLowerCase().includes("incompatible");
    return true;
  });

  return (
    <div className="flex flex-col rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#eef0f6] pb-2.5">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#171a30]">
              Actionable Deferred Work
            </h3>
            <span className="font-mono text-xs font-bold text-[#878da1]">
              · {deferredJobs.length} jobs
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-[#4d5468]">
            <span>{trainConflictCount} Train conflict</span>
            <span>·</span>
            <span>{resourceConflictCount} Resource</span>
            <span>·</span>
            <span>{windowConflictCount} Window</span>
          </div>
        </div>

        {/* Filter Chips Toolbar */}
        <div
          role="toolbar"
          aria-label="Deferred jobs filter"
          className="mt-2.5 flex flex-wrap items-center gap-1.5 border-b border-[#eef0f6] pb-2"
        >
          {DEFER_FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${
                  active
                    ? "bg-[#2e3092] text-white"
                    : "border border-[#e3e6f0] bg-white text-[#4d5468] hover:border-[#c4c9e2]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Deferred Job Items */}
        <div className="thin-scroll mt-2 space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {filteredJobs.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#878da1]">
              No deferred jobs match the selected filter.
            </div>
          ) : (
            filteredJobs.map((j) => {
            const isExpanded = expandedJobId === j.id;
            const alternatives = ALTERNATIVE_WINDOWS_MAP[j.id] ?? [];
            const isAtRisk = j.status === "at_risk";
            const isCarryForward = j.status === "carry_forward";

            return (
              <div
                key={j.id}
                className={`rounded-lg border p-3 transition-colors ${
                  isAtRisk
                    ? "border-[#fecaca] bg-[#fffafb]"
                    : isCarryForward
                      ? "border-[#e2e8f0] bg-[#f8fafc]"
                      : "border-[#e3e6f0] bg-[#fafbfd]"
                }`}
              >
                {/* Job Summary Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <TierChip tier={j.tier} compact />
                      <span className="font-mono text-xs font-black text-[#2e3092]">{j.id}</span>
                      <span className="font-semibold text-xs text-[#171a30] truncate" title={j.title}>
                        {j.title}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#878da1]">
                      <span>{j.dept} · {j.minutes} min</span>
                      <span>Due: <strong className="text-[#171a30]">{formatJobDeadline(j.deadline)}</strong></span>
                      {j.nextFeasibleDate && (
                        <span>Next feasible: <strong className="text-[#2e3092]">{j.nextFeasibleDate}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0 text-right">
                    {isAtRisk ? (
                      <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#dc2626] border border-[#fecaca]">
                        At risk
                      </span>
                    ) : isCarryForward ? (
                      <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#64748b] border border-[#cbd5e1]">
                        Carry-forward
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#fffbeb] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#d97706] border border-[#fde68a]">
                        Deferred
                      </span>
                    )}
                  </div>
                </div>

                {/* Reason Banner */}
                {j.reason && (
                  <div className="mt-2 rounded-md bg-white border border-[#edf0f7] p-2 text-xs text-[#4d5468] flex items-start gap-1.5">
                    <AlertCircle size={13} className="text-[#d97706] shrink-0 mt-0.5" />
                    <span>{j.reason}</span>
                  </div>
                )}

                {/* Actions: Why? & Find feasible slot */}
                <div className="mt-2 flex items-center justify-between border-t border-[#edf0f7] pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenReasonDrawer(j.id)}
                    className="text-xs font-bold text-[#2e3092] hover:underline"
                  >
                    Why not scheduled?
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpandedJobId(isExpanded ? null : j.id)}
                    className="flex items-center gap-1 rounded border border-[#2e3092]/30 bg-[#eef0fa] px-2 py-1 text-[11px] font-bold text-[#2e3092] hover:bg-[#2e3092] hover:text-white transition-colors"
                  >
                    <Sparkles size={12} />
                    <span>{isExpanded ? "Hide slots" : "Find feasible slot"}</span>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {/* Expanded Alternative Opportunities */}
                {isExpanded && (
                  <div className="mt-2.5 rounded-lg border border-[#e3e6f0] bg-white p-2.5 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                      Alternative Feasible Windows for {j.id}
                    </div>

                    {alternatives.map((alt, idx) => (
                      <div
                        key={idx}
                        className={`rounded border p-2 text-xs ${
                          alt.isFeasible
                            ? "border-[#bbf7d0] bg-[#f0fdf4]"
                            : "border-[#e2e8f0] bg-[#f8fafc] opacity-60"
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-[#171a30]">
                            {alt.windowId} · {alt.date} ({alt.startTime}–{alt.endTime})
                          </span>
                          <span
                            className={
                              alt.isFeasible ? "text-[#16a34a] font-mono text-[10px]" : "text-[#dc2626] font-mono text-[10px]"
                            }
                          >
                            {alt.isFeasible ? "✓ Feasible" : "✕ Infeasible"}
                          </span>
                        </div>

                        <p className="mt-0.5 text-[11px] text-[#4d5468]">{alt.note}</p>

                        <div className="mt-1.5 flex items-center justify-between text-[10px]">
                          <span className="text-[#878da1]">
                            Expected train impact:{" "}
                            <strong className="text-[#171a30]">+{alt.trainImpactDeltaMin} min</strong>
                          </span>

                          {alt.isFeasible && (
                            <button
                              type="button"
                              onClick={() => setPreviewAlt({ job: j, alt })}
                              className="rounded border border-[#16a34a] bg-white px-2 py-0.5 text-[10px] font-bold text-[#166534] hover:bg-[#16a34a] hover:text-white transition-colors"
                            >
                              Preview move →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {alternatives.length === 0 && (
                      <p className="text-xs text-[#878da1] italic p-1">
                        No feasible candidate slots found inside current September horizon.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>

      {/* Proposed Change Modal / Dialog */}
      {previewAlt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171a30]/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#e3e6f0] bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#eef0f6] pb-2.5">
              <h4 className="text-sm font-extrabold text-[#171a30]">Proposed Plan Modification</h4>
              <span className="rounded bg-[#eef0fa] px-2 py-0.5 font-mono text-[9px] font-bold text-[#2e3092]">
                Draft Revision r4
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="rounded-lg bg-[#f8f9fd] p-3 border border-[#edf0f7]">
                <div className="font-bold text-[#2e3092]">{previewAlt.job.id} · {previewAlt.job.title}</div>
                <div className="mt-1 text-[#4d5468]">
                  <span>Status Change: </span>
                  <strong className="text-[#d97706]">Deferred</strong> →{" "}
                  <strong className="text-[#16a34a]">Scheduled in {previewAlt.alt.windowId}</strong>
                </div>
                <div className="font-mono text-[11px] text-[#171a30] mt-0.5">
                  Slot: {previewAlt.alt.date} · {previewAlt.alt.startTime}–{previewAlt.alt.endTime} ({previewAlt.alt.durationMin} min)
                </div>
              </div>

              <div className="rounded-lg border border-[#e3e6f0] p-3 space-y-1 text-[11px] text-[#4d5468]">
                <div className="font-bold text-[#171a30] mb-1">Expected Plan Effects</div>
                <div className="flex justify-between">
                  <span>Scheduled maintenance:</span>
                  <strong className="text-[#16a34a]">+1 job</strong>
                </div>
                <div className="flex justify-between">
                  <span>Train regulation impact:</span>
                  <strong className="text-[#d97706]">+{previewAlt.alt.trainImpactDeltaMin} min</strong>
                </div>
                <div className="flex justify-between">
                  <span>Window utilization:</span>
                  <strong className="text-[#2e3092]">+{previewAlt.alt.utilizationDeltaPct}%</strong>
                </div>
                <div className="flex justify-between">
                  <span>Locked safety jobs disturbed:</span>
                  <strong className="text-[#16a34a]">0</strong>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#eef0f6] pt-3">
              <Button variant="secondary" onClick={() => setPreviewAlt(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onApplyAlternative(previewAlt.job.id, previewAlt.alt);
                  setPreviewAlt(null);
                }}
              >
                Apply Change (Create Draft r4)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
