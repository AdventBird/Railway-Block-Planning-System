import React, { useState } from "react";
import { Check, Edit3, XCircle, AlertCircle, Lock, ShieldAlert } from "lucide-react";
import type { OfficerPlanStatus } from "../../lib/approvalData";

interface OfficerDecisionProps {
  status: OfficerPlanStatus;
  locked: boolean;
  onApprove: () => void;
  onStartModify: () => void;
  onReject: (reason: string, note?: string) => void;
  onToggleLock?: () => void;
  scheduledJobsCount?: number;
  authorizedBlocksCount?: number;
  deferredJobsCount?: number;
  busy?: boolean;
}

const REJECT_REASONS = [
  "Train path conflict encroaches protected service",
  "Isolation certificate not produced / incomplete",
  "Required resource / machinery unavailable",
  "Window duration insufficient for safe work execution",
  "Operational priority override by Divisional Control",
  "Adverse weather or engineering speed restriction conflict",
];

export const OfficerDecision: React.FC<OfficerDecisionProps> = ({
  status,
  locked,
  onApprove,
  onStartModify,
  onReject,
  onToggleLock,
  scheduledJobsCount = 7,
  authorizedBlocksCount = 3,
  deferredJobsCount = 4,
  busy = false,
}) => {
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");

  const handleConfirmReject = () => {
    onReject(selectedReason, rejectNote.trim() || undefined);
    setRejectModalOpen(false);
  };

  return (
    <section className="rounded-xl border border-[#e3e6f0] bg-white p-5 shadow-sm transition-all sm:p-6">
      <div className="flex flex-col gap-5">
        {/* Header & Ready prompt */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-[#f1f3f9] pb-4">
          <div>
            <h2 className="text-base font-bold uppercase tracking-wider text-[#171a30] sm:text-lg">
              OFFICER DECISION
            </h2>
            <p className="mt-0.5 text-xs text-[#878da1] sm:text-sm">
              The proposed blocks are ready for authorization.
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[11px] font-semibold text-[#878da1]">
              Authorizing Authority: Dy. Chief Controller
            </span>
          </div>
        </div>

        {/* Consequence Summary: WHAT HAPPENS IF APPROVED */}
        <div className="rounded-lg border border-[#e3e6f0] bg-[#f8fafc] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#4d5468]">
            IF APPROVED
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0fdf4] font-bold text-[#16a34a]">
                ✓
              </span>
              <span className="text-[#171a30]">
                <strong>{scheduledJobsCount} maintenance jobs</strong> will proceed as scheduled.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0fdf4] font-bold text-[#16a34a]">
                ✓
              </span>
              <span className="text-[#171a30]">
                <strong>{authorizedBlocksCount} future blocks</strong> will be authorized.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#fffbeb] font-bold text-[#b45309]">
                ⚠
              </span>
              <span className="text-[#4d5468]">
                <strong>{deferredJobsCount} jobs</strong> will remain deferred.
              </span>
            </div>
          </div>
        </div>

        {/* Decision Action Buttons */}
        {status === "Pending Approval" && !locked && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* APPROVE PLAN - Primary & Visually Dominant */}
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="focus-primary flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#2e3092] px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#24266f] active:scale-[0.99] disabled:opacity-50"
            >
              <Check size={18} strokeWidth={2.5} />
              <span>APPROVE PLAN</span>
            </button>

            {/* MODIFY PLAN - Secondary */}
            <button
              type="button"
              onClick={onStartModify}
              disabled={busy}
              className="focus-primary inline-flex items-center justify-center gap-2 rounded-xl border border-[#2e3092] bg-white px-5 py-3 text-sm font-bold text-[#2e3092] transition-colors hover:bg-[#eef0fa] active:scale-[0.99] disabled:opacity-50"
            >
              <Edit3 size={16} />
              <span>MODIFY PLAN</span>
            </button>

            {/* REJECT PLAN - Secondary Subtle Danger */}
            <button
              type="button"
              onClick={() => setRejectModalOpen(true)}
              disabled={busy}
              className="focus-primary inline-flex items-center justify-center gap-2 rounded-xl border border-[#fecaca] bg-white px-5 py-3 text-sm font-bold text-[#dc2626] transition-colors hover:bg-[#fef2f2] active:scale-[0.99] disabled:opacity-50"
            >
              <XCircle size={16} />
              <span>REJECT PLAN</span>
            </button>
          </div>
        )}

        {/* Approved State — Shows Lock option */}
        {status === "Approved" && !locked && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[#166534]">
            <div className="flex items-center gap-2.5">
              <Check size={20} className="text-[#16a34a]" strokeWidth={2.5} />
              <div>
                <div className="font-bold">PLAN IS APPROVED</div>
                <div className="text-xs text-[#15803d]">
                  Possessions and bundled jobs are authorized. Lock the decision to freeze it against edits.
                </div>
              </div>
            </div>

            {onToggleLock && (
              <button
                type="button"
                onClick={onToggleLock}
                disabled={busy}
                className="focus-primary inline-flex items-center gap-1.5 rounded-lg border border-[#166534] bg-white px-4 py-2 text-xs font-bold text-[#166534] hover:bg-[#dcfce7]"
              >
                <Lock size={14} />
                <span>Lock Plan Decision</span>
              </button>
            )}
          </div>
        )}

        {/* Locked State */}
        {locked && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#e3e6f0] bg-[#f5f6fc] p-4 text-[#4d5468]">
            <div className="flex items-center gap-2.5">
              <Lock size={18} className="text-[#4d5468]" />
              <div>
                <div className="font-bold">DECISION LOCKED</div>
                <div className="text-xs text-[#878da1]">
                  Decision is frozen in the audit record. No further editing is permitted unless unlocked by an authorized officer.
                </div>
              </div>
            </div>

            {onToggleLock && (
              <button
                type="button"
                onClick={onToggleLock}
                disabled={busy}
                className="focus-primary inline-flex items-center gap-1.5 rounded-lg border border-[#d9ddef] bg-white px-3 py-1.5 text-xs font-bold text-[#4d5468] hover:bg-[#e9ecf5]"
              >
                <span>Unlock Plan</span>
              </button>
            )}
          </div>
        )}

        {/* Rejected State */}
        {status === "Rejected" && (
          <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-[#991b1b]">
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={18} className="text-[#dc2626]" />
              <div>
                <div className="font-bold">PLAN REJECTED</div>
                <div className="text-xs text-[#b91c1c]">
                  The proposed maintenance plan was rejected. Sent back for re-planning.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modified State */}
        {status === "Modified" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-[#c7d2fe] bg-[#eef0fa] p-4 text-[#2e3092]">
            <div>
              <div className="font-bold">PLAN MODIFIED · DRAFT REVISED</div>
              <div className="text-xs text-[#3b4992]">
                An updated revision was submitted. Review the new blocks before finalizing approval.
              </div>
            </div>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="focus-primary inline-flex items-center gap-1.5 rounded-lg bg-[#2e3092] px-4 py-2 text-xs font-bold text-white hover:bg-[#24266f]"
            >
              <Check size={14} />
              <span>Approve Updated Revision</span>
            </button>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div
            className="w-full max-w-md rounded-xl border border-[#e3e6f0] bg-white p-5 shadow-xl transition-all animate-in fade-in zoom-in-95"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between border-b border-[#f1f3f9] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#dc2626]">
                  REJECT PLAN
                </h3>
                <p className="mt-0.5 text-xs text-[#878da1]">
                  Specify a valid governance reason for rejecting the proposed plan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="rounded-lg p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4d5468] mb-1">
                  Reason for rejection
                </label>
                <select
                  value={selectedReason}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="focus-primary w-full rounded-lg border border-[#e3e6f0] bg-white px-3 py-2 text-xs text-[#171a30]"
                >
                  {REJECT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4d5468] mb-1">
                  Optional note for control office
                </label>
                <textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  rows={3}
                  placeholder="Additional context or specific timing adjustment instructions..."
                  className="focus-primary w-full rounded-lg border border-[#e3e6f0] bg-white p-2.5 text-xs text-[#171a30] placeholder:text-[#a2a7ba]"
                />
              </div>

              <div className="rounded-lg bg-[#fef2f2] p-2.5 text-[11px] text-[#991b1b] border border-[#fecaca]">
                <AlertCircle size={13} className="inline mr-1 text-[#dc2626]" />
                Rejection will be permanently recorded in the governance audit trail and dispatched to Divisional Control.
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#f1f3f9] pt-3">
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="focus-primary rounded-lg border border-[#e3e6f0] px-3 py-1.5 text-xs font-bold text-[#4d5468] hover:bg-[#f5f6fc]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="focus-primary rounded-lg bg-[#dc2626] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#b91c1c]"
              >
                Reject Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
