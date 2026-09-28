import { FileText, CalendarCheck2, Clock, AlertTriangle } from "lucide-react";

interface PlanSummaryProps {
  totalJobs: number;
  scheduledCount: number;
  deferredCount: number;
  atRiskCount: number;
  unscheduledCount?: number;
  deadlines: {
    id: string;
    title: string;
    due: string;
    status: "at_risk" | "deferred";
  }[];
  onSelectJob: (jobId: string) => void;
  onViewAllDeadlines?: () => void;
}

export function PlanSummary({
  totalJobs,
  scheduledCount,
  deferredCount,
  atRiskCount,
  unscheduledCount = 1,
  deadlines,
  onSelectJob,
  onViewAllDeadlines,
}: PlanSummaryProps) {
  const schedPct = Math.round((scheduledCount / totalJobs) * 100);
  const defPct = Math.round((deferredCount / totalJobs) * 100);
  const riskPct = Math.round((atRiskCount / totalJobs) * 100);

  return (
    <div className="flex flex-col rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
      <div>
        {/* Title */}
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#171a30]">
            Plan Summary <span className="font-normal text-[#878da1]">(1 – 30 Sep 2026)</span>
          </h2>
          <span className="font-mono text-[10px] text-[#878da1]">September Horizon</span>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* Total Jobs */}
          <div className="rounded-lg border border-[#e3e6f0] bg-[#f8f9fd] p-2.5">
            <div className="flex items-center gap-1.5 text-[#2e3092]">
              <FileText size={14} />
              <span className="text-[10px] font-bold uppercase text-[#878da1]">Total Jobs</span>
            </div>
            <div className="mt-1 font-mono text-xl font-black text-[#171a30]">{totalJobs}</div>
            <div className="text-[10px] text-[#878da1]">Corridor jobs</div>
          </div>

          {/* Scheduled */}
          <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-2.5">
            <div className="flex items-center gap-1.5 text-[#16a34a]">
              <CalendarCheck2 size={14} />
              <span className="text-[10px] font-bold uppercase text-[#166534]">Scheduled</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-black text-[#166534]">{scheduledCount}</span>
              <span className="font-mono text-[10px] font-bold text-[#16a34a]">{schedPct}%</span>
            </div>
            <div className="text-[10px] text-[#166534]/80">Allocated to blocks</div>
          </div>

          {/* Deferred */}
          <div className="rounded-lg border border-[#fef08a] bg-[#fffbeb] p-2.5">
            <div className="flex items-center gap-1.5 text-[#d97706]">
              <Clock size={14} />
              <span className="text-[10px] font-bold uppercase text-[#92400e]">Deferred</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-black text-[#b45309]">{deferredCount}</span>
              <span className="font-mono text-[10px] font-bold text-[#d97706]">{defPct}%</span>
            </div>
            <div className="text-[10px] text-[#92400e]/80">Alternative slots</div>
          </div>

          {/* At Risk */}
          <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-2.5">
            <div className="flex items-center gap-1.5 text-[#dc2626]">
              <AlertTriangle size={14} />
              <span className="text-[10px] font-bold uppercase text-[#991b1b]">At Risk</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-black text-[#dc2626]">{atRiskCount}</span>
              <span className="font-mono text-[10px] font-bold text-[#dc2626]">{riskPct}%</span>
            </div>
            <div className="text-[10px] text-[#991b1b]/80">Tight deadline</div>
          </div>
        </div>

        {/* Multi-segment Progress Bar */}
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#f1f3f9] flex">
            <div
              style={{ width: `${(scheduledCount / totalJobs) * 100}%` }}
              className="bg-[#16a34a]"
              title={`Scheduled: ${scheduledCount}`}
            />
            <div
              style={{ width: `${(deferredCount / totalJobs) * 100}%` }}
              className="bg-[#d97706]"
              title={`Deferred: ${deferredCount}`}
            />
            <div
              style={{ width: `${(atRiskCount / totalJobs) * 100}%` }}
              className="bg-[#dc2626]"
              title={`At Risk: ${atRiskCount}`}
            />
            <div
              style={{ width: `${(unscheduledCount / totalJobs) * 100}%` }}
              className="bg-[#cbd5e1]"
              title={`Unscheduled / Carry forward: ${unscheduledCount}`}
            />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 font-semibold text-[#166534]">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" />
              Scheduled ({scheduledCount})
            </span>
            <span className="flex items-center gap-1 font-semibold text-[#92400e]">
              <span className="h-2 w-2 rounded-full bg-[#d97706]" />
              Deferred ({deferredCount})
            </span>
            <span className="flex items-center gap-1 font-semibold text-[#991b1b]">
              <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
              At Risk ({atRiskCount})
            </span>
            <span className="flex items-center gap-1 font-semibold text-[#64748b]">
              <span className="h-2 w-2 rounded-full bg-[#cbd5e1]" />
              Unscheduled ({unscheduledCount})
            </span>
          </div>
        </div>
      </div>

      {/* Upcoming Deadlines Table */}
      <div className="mt-3 border-t border-[#eef0f6] pt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#171a30]">
            Upcoming Deadlines
          </span>
          <button
            onClick={onViewAllDeadlines}
            className="text-[10px] font-bold text-[#2e3092] hover:underline"
          >
            View all
          </button>
        </div>

        <div className="divide-y divide-[#eef0f6]">
          {deadlines.slice(0, 3).map((d) => (
            <div
              key={d.id}
              onClick={() => onSelectJob(d.id)}
              className="flex cursor-pointer items-center justify-between py-1.5 text-xs hover:bg-[#f8f9fd] px-1 rounded transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span className="font-mono text-[10px] font-bold text-[#2e3092]">{d.id}</span>
                <span className="truncate text-xs font-semibold text-[#171a30]" title={d.title}>
                  {d.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10px] text-[#878da1]">{d.due}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    d.status === "at_risk"
                      ? "border border-[#fecaca] bg-[#fef2f2] text-[#dc2626]"
                      : "border border-[#fde68a] bg-[#fffbeb] text-[#b45309]"
                  }`}
                >
                  {d.status === "at_risk" ? "● At risk" : "● Deferred"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
