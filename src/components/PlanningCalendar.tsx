// ---------------------------------------------------------------------------
// WEEK / MONTH planning views — embedded inside the Planning Workspace
// (Tonight / Week / Month switch). Click a day → DayDrawer.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { Card, Chip, CRIT, OK, PRIMARY, TierChip, WARN } from "./ui";
import { UtilBar } from "./TimelineUtil";
import { DayDrawer, JobDrawer } from "./drawers";
import { deadlines, monthSummary, weekPlan } from "../data/planData";
import { jobById, type Job } from "../data/jobsData";

const dayTone = (u: number): string => (u >= 85 ? OK : u >= 65 ? WARN : "#94a3b8");

/* --------------------------------- week ----------------------------------- */

export function WeekView() {
  const [day, setDay] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {weekPlan.map((d) => (
          <button
            key={d.date}
            onClick={() => setDay(d.date)}
            className={`focus-primary rounded-xl border p-3 text-left transition-colors duration-200 hover:border-[#2e3092]/50 ${
              d.util >= 85 ? "border-[#16a34a]/40 bg-[#f0fdf4]" : "border-[#e3e6f0] bg-white"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold text-[#171a30]">{d.day}</span>
              <span className="font-mono text-[10px] text-[#878da1]">{d.date}</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="font-mono text-lg font-extrabold text-[#171a30]">{d.blocks}</span>
              <span className="text-[10px] text-[#878da1]">blocks · {d.minutes}m</span>
            </div>
            <div className="mt-2">
              <UtilBar pct={d.util} tone={dayTone(d.util)} />
            </div>
            <p className="mt-1.5 truncate text-[10px] text-[#d97706]" title={d.note}>
              {d.note}
            </p>
          </button>
        ))}
      </div>
      {day && <DayDrawer date={day} day={weekPlan.find((w) => w.date === day)?.day ?? ""} onClose={() => setDay(null)} />}
    </div>
  );
}

/* --------------------------------- month ---------------------------------- */

export function MonthView() {
  const [job, setJob] = useState<Job | null>(null);
  const trendMax = Math.max(...monthSummary.utilizationTrend);
  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="px-4 py-3">
          <div className="font-mono text-2xl font-extrabold text-[#171a30]">{monthSummary.plannedBlocks}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Blocks this month</div>
          <div className="text-[11px] text-[#4d5468]">{monthSummary.plannedMinutes} min planned</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="font-mono text-2xl font-extrabold text-[#171a30]">{monthSummary.deferredCount}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Deferred</div>
          <div className="text-[11px] text-[#4d5468]">tier-rule compliant, all re-planned</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="font-mono text-2xl font-extrabold text-[#171a30]">{monthSummary.projectedUtil}%</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Projected utilization</div>
          <div className="mt-1.5 flex items-end gap-1.5">
            {monthSummary.utilizationTrend.map((u, i) => (
              <span
                key={i}
                className="w-4 rounded-t bg-[#2e3092]/25"
                style={{ height: `${(u / trendMax) * 28}px` }}
                title={`Week ${i + 1}: ${u}%`}
              />
            ))}
          </div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Asset availability</div>
          {monthSummary.assets.slice(0, 2).map((a) => (
            <div key={a.name} className="mt-1.5">
              <UtilBar pct={a.avail} tone={a.avail >= 60 ? OK : WARN} />
              <div className="mt-0.5 truncate text-[10px] text-[#878da1]" title={a.note}>
                {a.name}
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card className="p-4">
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#878da1]">Critical deadlines</h4>
        <div className="divide-y divide-[#eef0f6]">
          {deadlines.map((d) => (
            <button
              key={d.jobId}
              onClick={() => {
                const j = jobById(d.jobId);
                if (j) setJob(j);
              }}
              className="focus-primary flex w-full items-center gap-3 px-1 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
            >
              <TierChip tier={d.tier} compact />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#171a30]">{d.label}</span>
              <Chip
                label={d.overdue ? `Overdue ${d.due}` : d.due}
                color={d.overdue ? CRIT : PRIMARY}
                bg={d.overdue ? "#fef2f2" : "#eef0fa"}
              />
            </button>
          ))}
        </div>
      </Card>

      {job && <JobDrawer job={job} onClose={() => setJob(null)} />}
    </div>
  );
}