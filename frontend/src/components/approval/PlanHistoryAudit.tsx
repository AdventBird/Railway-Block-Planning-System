import React, { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import type { HumanPlanHistoryItem } from "../../lib/approvalData";
import type { AuditEntry } from "../../api/types";
import type { DecisionEntry } from "../../data/planData";

interface PlanHistoryAuditProps {
  planHistory: HumanPlanHistoryItem[];
  backendAudit?: AuditEntry[];
  seedDecisions?: DecisionEntry[];
}

export const PlanHistoryAudit: React.FC<PlanHistoryAuditProps> = ({
  planHistory,
  backendAudit = [],
  seedDecisions = [],
}) => {
  const [auditExpanded, setAuditExpanded] = useState(false);

  return (
    <section className="space-y-4 border-t border-[#e3e6f0] pt-6">
      {/* Plan History Header */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#171a30]">
          PLAN HISTORY
        </h2>
        <p className="text-xs text-[#878da1]">
          Chronological record of plan revisions and governance determinations
        </p>
      </div>

      {/* Human-Readable Plan History Cards / Timeline */}
      <div className="space-y-2.5">
        {planHistory.map((item, idx) => {
          const isCurrent = idx === 0;
          return (
            <div
              key={item.id}
              className={`rounded-xl border p-4 transition-all ${
                isCurrent
                  ? "border-[#2e3092]/30 bg-[#fafbfc]"
                  : "border-[#e3e6f0] bg-white opacity-90"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#171a30]">
                      {item.title}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        item.status === "Pending Approval"
                          ? "bg-[#fffbeb] text-[#92400e] border border-[#fde68a]"
                          : item.status === "Approved"
                          ? "bg-[#f0fdf4] text-[#166534] border border-[#bbf7d0]"
                          : item.status === "Superseded"
                          ? "bg-[#f1f3f9] text-[#4d5468] border border-[#e3e6f0]"
                          : "bg-[#eef0fa] text-[#2e3092] border border-[#c7d2fe]"
                      }`}
                    >
                      {item.status}
                    </span>

                    {/* Secondary metadata only */}
                    {item.technicalRevisionRef && (
                      <span className="rounded bg-[#f1f3f9] px-1.5 py-0.2 text-[9px] font-mono text-[#878da1]">
                        {item.technicalRevisionRef}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-xs text-[#4d5468]">
                    <span className="font-semibold text-[#171a30]">{item.date}</span>
                    <span className="mx-2 text-[#a2a7ba]">·</span>
                    <span>Reason: {item.reason}</span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-[11px] font-medium text-[#878da1]">
                    Officer: <span className="font-semibold text-[#4d5468]">{item.officer}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Collapsible Secondary Audit Trail */}
      <div className="rounded-xl border border-[#e3e6f0] bg-white">
        <button
          type="button"
          onClick={() => setAuditExpanded(!auditExpanded)}
          className="focus-primary flex w-full items-center justify-between p-3.5 text-left text-xs font-bold text-[#4d5468] hover:bg-[#fafbfc]"
        >
          <div className="flex items-center gap-2">
            <History size={14} className="text-[#2e3092]" />
            <span>View audit history &amp; governance log</span>
            <span className="rounded bg-[#f1f3f9] px-2 py-0.5 text-[10px] text-[#878da1]">
              {(backendAudit.length || seedDecisions.length)} entries
            </span>
          </div>
          {auditExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {auditExpanded && (
          <div className="border-t border-[#f1f3f9] p-4 text-xs">
            {backendAudit.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[#eef0f6] text-[10px] uppercase tracking-wider text-[#878da1]">
                      <th className="pb-2">Timestamp (UTC)</th>
                      <th className="pb-2">Action</th>
                      <th className="pb-2">Officer</th>
                      <th className="pb-2">Reason</th>
                      <th className="pb-2">Jobs Affected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f3f9]">
                    {[...backendAudit].reverse().map((entry) => (
                      <tr key={entry.entry_id} className="text-[#4d5468]">
                        <td className="py-2 font-mono text-[#878da1]">
                          {entry.timestamp.slice(0, 19).replace("T", " ")}
                        </td>
                        <td className="py-2 font-bold uppercase text-[#2e3092]">
                          {entry.action}
                        </td>
                        <td className="py-2">{entry.officer}</td>
                        <td className="py-2">{entry.reason || "—"}</td>
                        <td className="py-2 font-mono text-[10px] text-[#878da1]">
                          {entry.affected_jobs.length ? entry.affected_jobs.join(", ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[#eef0f6] text-[10px] uppercase tracking-wider text-[#878da1]">
                      <th className="pb-2">Timestamp</th>
                      <th className="pb-2">Action</th>
                      <th className="pb-2">Officer</th>
                      <th className="pb-2">Reason</th>
                      <th className="pb-2">Plan Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f3f9]">
                    {[...seedDecisions].reverse().map((d) => (
                      <tr key={d.id} className="text-[#4d5468]">
                        <td className="py-2 font-mono text-[#878da1]">{d.ts}</td>
                        <td className="py-2 font-bold uppercase text-[#2e3092]">{d.action}</td>
                        <td className="py-2">{d.officer}</td>
                        <td className="py-2">{d.overrideReason ?? "—"}</td>
                        <td className="py-2 text-[#878da1]">{d.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
