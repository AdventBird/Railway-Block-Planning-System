import React from "react";
import { ArrowUpRight, CheckCircle2, Clock, AlertTriangle, XCircle, Lock } from "lucide-react";
import type { OfficerPlanStatus } from "../../lib/approvalData";

interface CurrentPlanCardProps {
  status: OfficerPlanStatus;
  locked: boolean;
  revisedNote?: string | null;
  onNavigateToWorkspace?: () => void;
  blocksCount?: number;
  jobsCount?: number;
  dateStr?: string;
  planTitle?: string;
}

const STATUS_CONFIG: Record<
  OfficerPlanStatus,
  { label: string; badgeCls: string; dotCls: string; icon: React.ElementType }
> = {
  "Pending Approval": {
    label: "PENDING APPROVAL",
    badgeCls: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
    dotCls: "bg-[#d97706]",
    icon: Clock,
  },
  Approved: {
    label: "APPROVED",
    badgeCls: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
    dotCls: "bg-[#16a34a]",
    icon: CheckCircle2,
  },
  Modified: {
    label: "MODIFIED",
    badgeCls: "border-[#c7d2fe] bg-[#eef0fa] text-[#2e3092]",
    dotCls: "bg-[#2e3092]",
    icon: AlertTriangle,
  },
  Rejected: {
    label: "REJECTED",
    badgeCls: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
    dotCls: "bg-[#dc2626]",
    icon: XCircle,
  },
  Locked: {
    label: "LOCKED",
    badgeCls: "border-[#e3e6f0] bg-[#f5f6fc] text-[#4d5468]",
    dotCls: "bg-[#4d5468]",
    icon: Lock,
  },
};

export const CurrentPlanCard: React.FC<CurrentPlanCardProps> = ({
  status,
  locked,
  revisedNote,
  onNavigateToWorkspace,
  blocksCount = 3,
  jobsCount = 7,
  dateStr = "17 Sep 2026",
  planTitle = "Night Maintenance Plan",
}) => {
  const effectiveStatus: OfficerPlanStatus = locked ? "Locked" : status;
  const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG["Pending Approval"];
  const StatusIcon = cfg.icon;

  return (
    <div className="rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-sm transition-all sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: Identity & Scope */}
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#878da1]">
              CURRENT PLAN
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wider ${cfg.badgeCls}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${effectiveStatus === "Pending Approval" ? "animate-pulse" : ""} ${cfg.dotCls}`} />
              <StatusIcon size={12} className="shrink-0" />
              <span>{cfg.label}</span>
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-bold text-[#171a30] sm:text-xl">
              {dateStr} · {planTitle}
            </h2>
            <span className="text-xs font-medium text-[#878da1]">
              Plan Revision
            </span>
          </div>

          {revisedNote && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#fde68a] bg-[#fffbeb] px-2.5 py-1 text-[11px] font-medium text-[#92400e]">
              <span className="font-bold">Revision note:</span>
              <span>{revisedNote}</span>
            </div>
          )}
        </div>

        {/* Right side: Key Plan Summary & Action */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 border-t border-[#f1f3f9] pt-3 sm:border-0 sm:pt-0">
          <div className="flex items-center gap-4">
            <div className="text-left">
              <span className="text-base font-extrabold text-[#171a30] sm:text-lg">
                {blocksCount}
              </span>{" "}
              <span className="text-xs font-semibold text-[#878da1]">blocks</span>
            </div>
            <div className="h-4 w-px bg-[#e3e6f0]" />
            <div className="text-left">
              <span className="text-base font-extrabold text-[#171a30] sm:text-lg">
                {jobsCount}
              </span>{" "}
              <span className="text-xs font-semibold text-[#878da1]">maintenance jobs</span>
            </div>
          </div>

          {onNavigateToWorkspace && (
            <button
              type="button"
              onClick={onNavigateToWorkspace}
              className="focus-primary inline-flex items-center gap-1.5 rounded-lg border border-[#e3e6f0] bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-[#2e3092] transition-colors duration-150 hover:bg-[#eef0fa]"
            >
              <span>View Full Plan</span>
              <ArrowUpRight size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
