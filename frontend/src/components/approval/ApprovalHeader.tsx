import React from "react";
import { ArrowRight, Lock, Unlock } from "lucide-react";
import type { OfficerPlanStatus } from "../../lib/approvalData";

interface ApprovalHeaderProps {
  status: OfficerPlanStatus;
  locked: boolean;
  onNavigateToWorkspace?: () => void;
  onToggleLock: () => void;
  lockDisabled?: boolean;
}

export const ApprovalHeader: React.FC<ApprovalHeaderProps> = ({
  status,
  locked,
  onNavigateToWorkspace,
  onToggleLock,
  lockDisabled = false,
}) => {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#e3e6f0] pb-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight text-[#171a30] sm:text-2xl">
            APPROVAL &amp; HISTORY
          </h1>
          <span className="rounded-md bg-[#f1f3f9] px-2 py-0.5 text-[11px] font-medium text-[#4d5468]">
            September 2026 · Night Maintenance Plan
          </span>
        </div>
        <p className="mt-1 text-xs text-[#878da1] sm:text-sm">
          Review the proposed maintenance plan and authorize, modify, or reject it.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {onNavigateToWorkspace && (
          <button
            type="button"
            onClick={onNavigateToWorkspace}
            className="focus-primary inline-flex items-center gap-1.5 rounded-lg border border-[#e3e6f0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2e3092] transition-colors duration-150 hover:bg-[#f5f6fc]"
          >
            <span>View in Planning Workspace</span>
            <ArrowRight size={13} />
          </button>
        )}

        {(status === "Approved" || locked) && (
          <button
            type="button"
            onClick={onToggleLock}
            disabled={lockDisabled}
            className={`focus-primary inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors duration-150 ${
              locked
                ? "border-[#d9ddef] bg-[#f5f6fc] text-[#4d5468] hover:bg-[#e9ecf5]"
                : "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534] hover:bg-[#dcfce7]"
            } disabled:opacity-50`}
            title={locked ? "Unlock decision for modification" : "Lock approved plan decision"}
          >
            {locked ? <Unlock size={13} /> : <Lock size={13} />}
            <span>{locked ? "Unlock Decision" : "Lock Plan"}</span>
          </button>
        )}
      </div>
    </div>
  );
};
