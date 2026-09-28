import React, { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, AlertCircle, Calendar } from "lucide-react";
import type { ReviewIssue } from "../../lib/approvalData";

interface IssuesToReviewProps {
  issues: ReviewIssue[];
  onSelectIssue?: (issue: ReviewIssue) => void;
}

export const IssuesToReview: React.FC<IssuesToReviewProps> = ({
  issues,
  onSelectIssue,
}) => {
  const [expandedAll, setExpandedAll] = useState(false);

  // If there are no issues, show clean zero-state
  if (!issues || issues.length === 0) {
    return (
      <section className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[#166534] shadow-sm">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 size={18} className="text-[#16a34a]" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#166534]">
              ✓ NO UNRESOLVED ISSUES
            </h3>
            <p className="mt-0.5 text-xs text-[#15803d]">
              The proposed plan has no current exceptions requiring officer review.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const visibleIssues = expandedAll ? issues : issues.slice(0, 3);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#171a30]">
            ISSUES TO REVIEW · {issues.length}
          </h2>
          <span className="rounded bg-[#fef2f2] px-2 py-0.5 text-[10px] font-bold text-[#dc2626] border border-[#fecaca]">
            Actionable exceptions
          </span>
        </div>

        {issues.length > 3 && (
          <button
            type="button"
            onClick={() => setExpandedAll(!expandedAll)}
            className="focus-primary inline-flex items-center gap-1 text-xs font-bold text-[#2e3092] hover:underline"
          >
            <span>{expandedAll ? "Show less" : "View all issues"}</span>
            {expandedAll ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {visibleIssues.map((issue) => (
          <div
            key={issue.id}
            className="flex flex-col justify-between rounded-xl border border-[#e3e6f0] bg-white p-3.5 shadow-sm transition-all hover:border-[#d97706]/40"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-[#2e3092]">
                    {issue.jobId}
                  </span>
                  <span className="rounded bg-[#f1f3f9] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#4d5468]">
                    {issue.dept}
                  </span>
                </div>
                <span className="rounded bg-[#fffbeb] px-2 py-0.5 text-[10px] font-bold text-[#b45309] border border-[#fde68a]">
                  {issue.status}
                </span>
              </div>

              <h4 className="mt-1.5 text-xs font-bold text-[#171a30] line-clamp-1">
                {issue.title}
              </h4>

              <div className="mt-2 space-y-1 text-xs text-[#4d5468]">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-[#878da1]">Reason:</span>
                  <span className="font-semibold text-[#dc2626]">{issue.reason}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Calendar size={11} className="text-[#878da1]" />
                  <span className="text-[#878da1]">Next feasible:</span>
                  <span className="font-semibold text-[#171a30]">{issue.nextFeasible}</span>
                </div>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-[#878da1] line-clamp-2">
                {issue.consequence}
              </p>
            </div>

            {onSelectIssue && (
              <div className="mt-3 border-t border-[#f1f3f9] pt-2 text-right">
                <button
                  type="button"
                  onClick={() => onSelectIssue(issue)}
                  className="focus-primary inline-flex items-center gap-1 text-[11px] font-bold text-[#2e3092] hover:underline"
                >
                  <AlertCircle size={11} />
                  <span>Reconsider in Modify</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
