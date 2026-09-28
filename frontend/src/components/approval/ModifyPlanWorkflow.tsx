import React, { useState } from "react";
import {
  X,
  Layers,
  Briefcase,
  Clock,
  AlertTriangle,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";
import {
  PROPOSED_BLOCKS,
  SYSTEM_ALTERNATIVES,
  type FeasibleAlternative,
  type DraftChange,
} from "../../lib/approvalData";

interface ModifyPlanWorkflowProps {
  onCancel: () => void;
  onSubmitDraft: (summary: string, changes: DraftChange[]) => void;
  initialTargetType?: "block" | "job" | "deferred" | "issue";
  initialTargetId?: string;
}

type ReconsiderType = "block" | "job" | "deferred" | "issue";

export const ModifyPlanWorkflow: React.FC<ModifyPlanWorkflowProps> = ({
  onCancel,
  onSubmitDraft,
  initialTargetType = "block",
  initialTargetId,
}) => {
  const [reconsiderType, setReconsiderType] = useState<ReconsiderType>(initialTargetType);
  const [selectedBlockId, setSelectedBlockId] = useState<string>(initialTargetId ?? "W1");
  const [selectedJobId, setSelectedJobId] = useState<string>("J-05");
  const [selectedIssueId, setSelectedIssueId] = useState<string>("J-06");

  // Preview state
  const [pendingAlt, setPendingAlt] = useState<FeasibleAlternative | null>(null);

  // Accumulated draft changes
  const [draftChanges, setDraftChanges] = useState<DraftChange[]>([]);
  const [reviewingDraft, setReviewingDraft] = useState<boolean>(false);
  const [justAddedChange, setJustAddedChange] = useState<DraftChange | null>(null);

  const selectedBlock = PROPOSED_BLOCKS.find((b) => b.id === selectedBlockId) ?? PROPOSED_BLOCKS[0];

  // Look up alternatives based on current selection
  const currentTargetKey =
    reconsiderType === "block"
      ? selectedBlock.id
      : reconsiderType === "job"
      ? selectedJobId
      : reconsiderType === "deferred"
      ? "J-05"
      : selectedIssueId;

  const alternatives = SYSTEM_ALTERNATIVES[currentTargetKey] ?? SYSTEM_ALTERNATIVES["W1"];

  const handleSelectAlternative = (alt: FeasibleAlternative) => {
    if (!alt.feasible && alt.feasibilityTag === "Infeasible") return;
    setPendingAlt(alt);
  };

  const handleApplyPendingChange = () => {
    if (!pendingAlt) return;

    let targetTitle = "";
    let prevAlloc = "";

    if (pendingAlt.targetType === "block") {
      targetTitle = `Block ${selectedBlock.name} (${selectedBlock.section})`;
      prevAlloc = `${selectedBlock.date} · ${selectedBlock.timeWindow}`;
    } else if (pendingAlt.targetType === "job" || pendingAlt.targetType === "deferred") {
      targetTitle = `${selectedJobId} · OHE auto-tension adjustment`;
      prevAlloc = "Deferred (Train conflict)";
    } else {
      targetTitle = "J-06 · Girder bridge bearing inspection";
      prevAlloc = "Deferred (Resource conflict)";
    }

    const newChange: DraftChange = {
      id: `CHG-${Date.now()}`,
      targetType: pendingAlt.targetType,
      targetId: pendingAlt.targetId,
      targetTitle,
      previousAllocation: prevAlloc,
      newAllocation: `${pendingAlt.windowLabel} (${pendingAlt.timeWindow})`,
      expectedTrainImpactChange: pendingAlt.trainDelaySummary,
      jobsCountChange:
        pendingAlt.scheduledDelta > 0
          ? `+${pendingAlt.scheduledDelta} scheduled`
          : pendingAlt.scheduledDelta < 0
          ? `${pendingAlt.scheduledDelta} scheduled`
          : "No count change",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setDraftChanges((prev) => [...prev, newChange]);
    setJustAddedChange(newChange);
    setPendingAlt(null);
  };

  const handleFinalSubmit = () => {
    const summary = draftChanges
      .map((c) => `${c.targetTitle}: ${c.previousAllocation} → ${c.newAllocation}`)
      .join("; ");
    onSubmitDraft(summary || "Updated plan parameters based on officer review", draftChanges);
  };

  return (
    <div className="rounded-xl border border-[#2e3092]/30 bg-white p-5 shadow-md">
      {/* Modify Mode Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#e3e6f0] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-[#171a30] sm:text-lg">
              MODIFY PLAN
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#2e3092] bg-[#eef0fa] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#2e3092]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2e3092] animate-pulse" />
              <span>EDITING DRAFT</span>
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#878da1]">
            Targeted decision support — select an element to evaluate system-tested alternatives and consequences.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="focus-primary inline-flex items-center gap-1.5 rounded-lg border border-[#e3e6f0] px-3 py-1.5 text-xs font-bold text-[#4d5468] hover:bg-[#f5f6fc]"
        >
          <X size={13} />
          <span>Cancel Changes</span>
        </button>
      </div>

      {/* Just Added Change Notification */}
      {justAddedChange && !pendingAlt && !reviewingDraft && (
        <div className="my-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-xs text-[#166534]">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-[#16a34a]" />
            <div>
              <span className="font-bold">CHANGE ADDED TO DRAFT: </span>
              <span>{justAddedChange.targetTitle} → {justAddedChange.newAllocation}</span>
              <span className="ml-2 font-mono text-[11px] text-[#15803d]">
                ({draftChanges.length} draft change{draftChanges.length === 1 ? "" : "s"})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReviewingDraft(true)}
              className="focus-primary rounded-md bg-[#166534] px-3 py-1 text-xs font-bold text-white hover:bg-[#14532d]"
            >
              Review Changes
            </button>
            <button
              type="button"
              onClick={() => setJustAddedChange(null)}
              className="focus-primary text-xs font-bold text-[#166534] hover:underline"
            >
              Continue Editing
            </button>
          </div>
        </div>
      )}

      {/* REVIEW DRAFT SCREEN */}
      {reviewingDraft ? (
        <div className="my-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#f1f3f9] pb-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#171a30]">
                PLAN CHANGES ({draftChanges.length})
              </h3>
              <p className="text-xs text-[#878da1]">
                Review modified elements before submitting the updated plan back for approval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReviewingDraft(false)}
              className="text-xs font-bold text-[#2e3092] hover:underline"
            >
              ← Back to editing
            </button>
          </div>

          <div className="rounded-lg border border-[#e3e6f0] bg-[#fafbfc] divide-y divide-[#eef0f6]">
            {draftChanges.map((chg, idx) => (
              <div key={chg.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#eef0fa] font-mono text-[10px] font-bold text-[#2e3092]">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-[#171a30]">
                      {chg.targetTitle}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[#878da1]">
                    {chg.timestamp}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4d5468]">
                  <div>
                    <span className="text-[#878da1]">Previous: </span>
                    <span className="line-through">{chg.previousAllocation}</span>
                  </div>
                  <ArrowRight size={12} className="text-[#2e3092]" />
                  <div>
                    <span className="text-[#878da1]">Updated: </span>
                    <span className="font-bold text-[#166534]">{chg.newAllocation}</span>
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-[#2e3092]">
                  Impact: {chg.jobsCountChange} · {chg.expectedTrainImpactChange}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-[#e3e6f0] bg-[#f8fafc] p-3 text-xs text-[#4d5468]">
            <span className="font-bold text-[#171a30]">Net plan consequence: </span>
            Submitting will increment the draft version and return the maintenance plan to{" "}
            <strong>Pending Approval</strong> for final officer authorization.
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setReviewingDraft(false)}
              className="focus-primary rounded-lg border border-[#e3e6f0] px-4 py-2 text-xs font-bold text-[#4d5468] hover:bg-[#f5f6fc]"
            >
              Continue Modifying
            </button>
            <button
              type="button"
              onClick={handleFinalSubmit}
              className="focus-primary rounded-lg bg-[#2e3092] px-5 py-2 text-xs font-bold text-white hover:bg-[#24266f]"
            >
              Submit Updated Plan for Approval
            </button>
          </div>
        </div>
      ) : pendingAlt ? (
        /* PREVIEW CHANGE SCREEN */
        <div className="my-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#f1f3f9] pb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2e3092]">
                DECISION SUPPORT PREVIEW
              </span>
              <h3 className="text-base font-bold text-[#171a30]">
                PREVIEW CHANGE · {pendingAlt.targetId}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setPendingAlt(null)}
              className="text-xs font-bold text-[#878da1] hover:text-[#171a30]"
            >
              Back to options
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Current Allocation */}
            <div className="rounded-lg border border-[#e3e6f0] bg-[#f8fafc] p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#878da1]">
                CURRENT ALLOCATION
              </div>
              <div className="mt-1 text-sm font-bold text-[#171a30]">
                {reconsiderType === "block"
                  ? `${selectedBlock.name} · ${selectedBlock.section}`
                  : `${selectedJobId} · Current Plan`}
              </div>
              <div className="mt-1 text-xs text-[#4d5468]">
                {reconsiderType === "block"
                  ? `${selectedBlock.date} · ${selectedBlock.timeWindow} (${selectedBlock.durationMinutes} min)`
                  : "Deferred due to train conflict on 17 Sep"}
              </div>
            </div>

            {/* Proposed Allocation */}
            <div className="rounded-lg border border-[#2e3092]/40 bg-[#eef0fa] p-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#2e3092]">
                PROPOSED REVISION
              </div>
              <div className="mt-1 text-sm font-bold text-[#2e3092]">
                {pendingAlt.windowLabel}
              </div>
              <div className="mt-1 text-xs text-[#171a30]">
                Window: {pendingAlt.timeWindow} · {pendingAlt.fitSummary}
              </div>
            </div>
          </div>

          {/* Expected Consequence / Operational Impact */}
          <div className="rounded-lg border border-[#e3e6f0] bg-white p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[#171a30]">
              EXPECTED OPERATIONAL EFFECT
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div className="rounded-md bg-[#f8fafc] p-2.5 border border-[#eef0f6]">
                <div className="text-[10px] text-[#878da1] uppercase font-bold">Scheduled jobs</div>
                <div className="mt-1 font-mono text-base font-extrabold text-[#171a30]">
                  7 → {7 + pendingAlt.scheduledDelta}
                </div>
              </div>
              <div className="rounded-md bg-[#f8fafc] p-2.5 border border-[#eef0f6]">
                <div className="text-[10px] text-[#878da1] uppercase font-bold">Deferred jobs</div>
                <div className="mt-1 font-mono text-base font-extrabold text-[#171a30]">
                  4 → {4 + pendingAlt.deferredDelta}
                </div>
              </div>
              <div className="rounded-md bg-[#f8fafc] p-2.5 border border-[#eef0f6]">
                <div className="text-[10px] text-[#878da1] uppercase font-bold">Train delay impact</div>
                <div className="mt-1 font-mono text-base font-extrabold text-[#2e3092]">
                  25 → {pendingAlt.expectedTrainImpactMinutes} min
                </div>
              </div>
              <div className="rounded-md bg-[#f8fafc] p-2.5 border border-[#eef0f6]">
                <div className="text-[10px] text-[#878da1] uppercase font-bold">Locked jobs affected</div>
                <div className="mt-1 font-mono text-base font-extrabold text-[#16a34a]">
                  0
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-[#4d5468]">
              <strong>Corridor stability: </strong>
              {pendingAlt.expectedImpactDeltaMinutes > 0
                ? `Adds +${pendingAlt.expectedImpactDeltaMinutes} min regulation buffer to adjacent freight slot.`
                : "No adverse regulation to primary Rajdhani or passenger paths."}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPendingAlt(null)}
              className="focus-primary rounded-lg border border-[#e3e6f0] px-4 py-2 text-xs font-bold text-[#4d5468] hover:bg-[#f5f6fc]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApplyPendingChange}
              className="focus-primary rounded-lg bg-[#2e3092] px-5 py-2 text-xs font-bold text-white hover:bg-[#24266f]"
            >
              Apply Change to Draft
            </button>
          </div>
        </div>
      ) : (
        /* MAIN RECONSIDERATION SELECTOR & OPTIONS */
        <div className="my-4 space-y-4">
          {/* Step 1: Select Category */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#4d5468] mb-2">
              Select what you want to reconsider:
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "block", label: "Block", icon: Layers },
                { id: "job", label: "Job", icon: Briefcase },
                { id: "deferred", label: "Deferred Work", icon: Clock },
                { id: "issue", label: "Issue", icon: AlertTriangle },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = reconsiderType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setReconsiderType(tab.id as ReconsiderType);
                      setPendingAlt(null);
                    }}
                    className={`focus-primary inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors ${
                      active
                        ? "border-[#2e3092] bg-[#2e3092] text-white"
                        : "border-[#e3e6f0] bg-white text-[#4d5468] hover:bg-[#f5f6fc]"
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-selector for Block */}
          {reconsiderType === "block" && (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#878da1] mb-1.5">
                  Select block to modify:
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {PROPOSED_BLOCKS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedBlockId(b.id)}
                      className={`focus-primary rounded-lg border p-3 text-left transition-all ${
                        selectedBlockId === b.id
                          ? "border-[#2e3092] bg-[#eef0fa]"
                          : "border-[#e3e6f0] bg-white hover:bg-[#fafbfc]"
                      }`}
                    >
                      <div className="font-mono text-sm font-extrabold text-[#2e3092]">
                        {b.name}
                      </div>
                      <div className="text-xs font-bold text-[#171a30]">
                        {b.section} · {b.track}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[#4d5468]">
                        <span>{b.timeWindow}</span>
                        <span className="font-semibold">{b.bundledJobs.length} jobs</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected Block Info & Justification */}
              <div className="rounded-lg border border-[#e3e6f0] bg-[#f8fafc] p-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-[#171a30]">
                    MODIFY BLOCK {selectedBlock.name} ({selectedBlock.section})
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#4d5468]">
                    {selectedBlock.timeWindow}
                  </span>
                </div>

                <div className="mt-2 text-xs text-[#4d5468]">
                  <span className="font-semibold text-[#171a30]">Current bundled jobs: </span>
                  {selectedBlock.bundledJobs.map((j) => `${j.id} (${j.title})`).join(" · ")}
                </div>

                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1] mb-1">
                    Why this block?
                  </div>
                  <div className="grid grid-cols-1 gap-1 text-[11px] text-[#171a30] sm:grid-cols-2">
                    <div className="flex items-center gap-1.5">
                      <Check size={12} className="text-[#16a34a]" />
                      <span>Maintenance fits available traffic window</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check size={12} className="text-[#16a34a]" />
                      <span>Allocated plant &amp; machinery available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check size={12} className="text-[#16a34a]" />
                      <span>Required traction power isolation verified</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Check size={12} className="text-[#16a34a]" />
                      <span>Future protected movements respected</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-selector for Job / Deferred */}
          {(reconsiderType === "job" || reconsiderType === "deferred") && (
            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#878da1]">
                Select job to reconsider:
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "J-05",
                    title: "OHE auto-tension adjustment",
                    status: "Deferred",
                    reason: "Train conflict",
                    due: "18 Sep",
                  },
                  {
                    id: "J-06",
                    title: "Girder bridge bearing inspection",
                    status: "Deferred",
                    reason: "Resource conflict",
                    due: "24 Sep",
                  },
                ].map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setSelectedJobId(job.id)}
                    className={`focus-primary rounded-lg border p-3 text-left transition-all ${
                      selectedJobId === job.id
                        ? "border-[#2e3092] bg-[#eef0fa]"
                        : "border-[#e3e6f0] bg-white hover:bg-[#fafbfc]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#2e3092]">{job.id}</span>
                      <span className="text-xs font-bold text-[#171a30]">{job.title}</span>
                      <span className="rounded bg-[#fffbeb] px-1.5 py-0.2 text-[9px] font-bold text-[#b45309] border border-[#fde68a]">
                        {job.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[#4d5468]">
                      Reason: <strong>{job.reason}</strong> · Due: <strong>{job.due}</strong>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sub-selector for Issue */}
          {reconsiderType === "issue" && (
            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#878da1]">
                Select operational exception:
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    id: "J-06",
                    title: "Girder bridge bearing inspection",
                    conflict: "REMM access crane committed to W2",
                  },
                  {
                    id: "J-05",
                    title: "OHE auto-tension adjustment",
                    conflict: "Power feed isolation conflict at PRYJ",
                  },
                ].map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={`focus-primary rounded-lg border p-3 text-left transition-all ${
                      selectedIssueId === issue.id
                        ? "border-[#2e3092] bg-[#eef0fa]"
                        : "border-[#e3e6f0] bg-white hover:bg-[#fafbfc]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#2e3092]">{issue.id}</span>
                      <span className="text-xs font-bold text-[#171a30]">{issue.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-[#dc2626]">
                      Conflict: {issue.conflict}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ALTERNATIVE OPTIONS (SYSTEM-GENERATED) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#2e3092]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#171a30]">
                  FEASIBLE ALTERNATIVE OPTIONS
                </span>
              </div>
              <span className="text-[11px] text-[#878da1]">
                System-calculated against real timetable &amp; resources
              </span>
            </div>

            <div className="space-y-2">
              {alternatives.map((alt) => {
                const isInfeasible = !alt.feasible && alt.feasibilityTag === "Infeasible";
                const isCaution = alt.feasibilityTag === "Caution";
                return (
                  <div
                    key={alt.id}
                    onClick={() => !isInfeasible && handleSelectAlternative(alt)}
                    className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3.5 transition-all ${
                      isInfeasible
                        ? "cursor-not-allowed border-[#fecaca] bg-[#fff8f8] opacity-70"
                        : "cursor-pointer border-[#e3e6f0] bg-white hover:border-[#2e3092] hover:bg-[#fafbfc]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#171a30]">
                          {alt.windowLabel}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                            alt.feasible
                              ? "bg-[#f0fdf4] text-[#166534]"
                              : isCaution
                              ? "bg-[#fffbeb] text-[#b45309]"
                              : "bg-[#fef2f2] text-[#991b1b]"
                          }`}
                        >
                          {alt.feasibilityTag}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#4d5468]">
                        {alt.infeasibleReason ? (
                          <span className="text-[#dc2626] font-medium">{alt.infeasibleReason}</span>
                        ) : (
                          <span>{alt.fitSummary}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-left sm:text-right">
                        <div className="text-xs font-semibold text-[#171a30]">
                          {alt.trainDelaySummary}
                        </div>
                        <div className="text-[10px] text-[#878da1]">
                          Total delay: {alt.expectedTrainImpactMinutes} min
                        </div>
                      </div>

                      {!isInfeasible ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAlternative(alt);
                          }}
                          className="focus-primary inline-flex items-center gap-1 rounded-md bg-[#2e3092] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#24266f]"
                        >
                          <span>Preview</span>
                          <ArrowRight size={12} />
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-[#dc2626]">
                          Invalid
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Draft Changes quick bar at bottom if changes exist */}
          {draftChanges.length > 0 && (
            <div className="flex items-center justify-between border-t border-[#f1f3f9] pt-3">
              <span className="text-xs font-semibold text-[#4d5468]">
                {draftChanges.length} draft change{draftChanges.length === 1 ? "" : "s"} ready for review
              </span>
              <button
                type="button"
                onClick={() => setReviewingDraft(true)}
                className="focus-primary rounded-lg bg-[#2e3092] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#24266f]"
              >
                Review &amp; Submit Draft
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
