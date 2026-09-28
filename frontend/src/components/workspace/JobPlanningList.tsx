import { useState, useMemo } from "react";
import { Search, ChevronRight } from "lucide-react";
import { TierChip } from "../ui";
import type { HorizonJob } from "../../data/horizonData";

interface JobPlanningListProps {
  jobs: HorizonJob[];
  selectedJobId?: string | null;
  onSelectJob: (job: HorizonJob) => void;
}

type JobFilterTab = "all" | "scheduled" | "deferred" | "at_risk";

export function JobPlanningList({
  jobs,
  selectedJobId,
  onSelectJob,
}: JobPlanningListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<JobFilterTab>("all");

  const counts = useMemo(() => {
    return {
      all: jobs.length,
      scheduled: jobs.filter((j) => j.status === "scheduled").length,
      deferred: jobs.filter((j) => j.status === "deferred" || j.status === "carry_forward").length,
      at_risk: jobs.filter((j) => j.status === "at_risk").length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      // Tab filter
      if (filterTab === "scheduled" && j.status !== "scheduled") return false;
      if (filterTab === "deferred" && j.status !== "deferred" && j.status !== "carry_forward")
        return false;
      if (filterTab === "at_risk" && j.status !== "at_risk") return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          j.id.toLowerCase().includes(q) ||
          j.title.toLowerCase().includes(q) ||
          j.dept.toLowerCase().includes(q) ||
          (j.sectionName && j.sectionName.toLowerCase().includes(q)) ||
          (j.plannedDate && j.plannedDate.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [jobs, filterTab, searchQuery]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#e3e6f0] bg-white shadow-xs">
      {/* Header and Search */}
      <div className="border-b border-[#eef0f6] p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-bold text-[#171a30]">Jobs</h2>
            <span className="font-mono text-xs font-bold text-[#878da1]">({jobs.length})</span>
          </div>

          {/* Search Input */}
          <div className="relative w-48">
            <Search size={13} className="absolute left-2.5 top-2 text-[#878da1]" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-[#e3e6f0] bg-[#f8f9fd] py-1 pl-8 pr-2 text-xs text-[#171a30] placeholder-[#878da1] focus:border-[#2e3092] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Filter Pills */}
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="toolbar" aria-label="Job filters">
          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${
              filterTab === "all"
                ? "bg-[#2e3092] text-white"
                : "bg-[#f1f3f9] text-[#4d5468] hover:bg-[#e4e7f3]"
            }`}
          >
            All ({counts.all})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("scheduled")}
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${
              filterTab === "scheduled"
                ? "bg-[#16a34a] text-white"
                : "bg-[#f0fdf4] text-[#166534] hover:bg-[#dcfce7]"
            }`}
          >
            Scheduled ({counts.scheduled})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("deferred")}
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${
              filterTab === "deferred"
                ? "bg-[#d97706] text-white"
                : "bg-[#fffbeb] text-[#92400e] hover:bg-[#fef3c7]"
            }`}
          >
            Deferred ({counts.deferred})
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("at_risk")}
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold transition-colors ${
              filterTab === "at_risk"
                ? "bg-[#dc2626] text-white"
                : "bg-[#fef2f2] text-[#991b1b] hover:bg-[#fee2e2]"
            }`}
          >
            At Risk ({counts.at_risk})
          </button>
        </div>
      </div>

      {/* Table of Jobs */}
      <div className="thin-scroll flex-1 overflow-y-auto max-h-[360px]">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 border-b border-[#eef0f6] bg-[#fafbfd] font-mono text-[9px] font-bold uppercase tracking-wider text-[#878da1]">
            <tr>
              <th className="py-2 pl-3 pr-2">ID</th>
              <th className="py-2 px-2">Job Name</th>
              <th className="py-2 px-2 text-center">Priority</th>
              <th className="py-2 px-2 text-right">Planned Date</th>
              <th className="py-2 pl-2 pr-3 text-right">Status</th>
              <th className="w-6 pr-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef0f6]">
            {filteredJobs.map((j) => {
              const isSelected = selectedJobId === j.id;
              // Format date string for display (e.g. 2026-09-17 -> 17 Sep)
              let displayDate = "—";
              if (j.plannedDate) {
                const parts = j.plannedDate.split("-");
                if (parts.length === 3) {
                  displayDate = `${Number(parts[2])} Sep`;
                }
              }

              return (
                <tr
                  key={j.id}
                  onClick={() => onSelectJob(j)}
                  className={`cursor-pointer transition-colors duration-150 hover:bg-[#f5f6fc] ${
                    isSelected ? "bg-[#eef0fa]" : ""
                  }`}
                >
                  <td className="py-2 pl-3 pr-2 font-mono text-[11px] font-bold text-[#2e3092]">
                    {j.id}
                  </td>
                  <td className="py-2 px-2">
                    <div className="max-w-[170px] truncate text-xs font-semibold text-[#171a30]" title={j.title}>
                      {j.title}
                    </div>
                    <div className="text-[10px] text-[#878da1]">{j.dept}</div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <TierChip tier={j.tier} compact />
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-[11px] font-bold text-[#171a30]">
                    {displayDate}
                  </td>
                  <td className="py-2 pl-2 pr-3 text-right">
                    {j.status === "scheduled" ? (
                      <span className="inline-block rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#16a34a] border border-[#bbf7d0]">
                        Scheduled
                      </span>
                    ) : j.status === "at_risk" ? (
                      <span className="inline-block rounded-full bg-[#fef2f2] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#dc2626] border border-[#fecaca]">
                        At risk
                      </span>
                    ) : j.status === "carry_forward" ? (
                      <span className="inline-block rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#64748b] border border-[#cbd5e1]">
                        Carry fwd
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-[#fffbeb] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#d97706] border border-[#fde68a]">
                        Deferred
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right text-[#878da1]">
                    <ChevronRight size={13} />
                  </td>
                </tr>
              );
            })}
            {filteredJobs.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-xs italic text-[#878da1]">
                  No maintenance jobs match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
