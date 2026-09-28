import { ChevronLeft, ChevronRight } from "lucide-react";
import { UtilBar } from "../TimelineUtil";
import { OK, WARN } from "../ui";
import { SEPTEMBER_CALENDAR } from "../../data/horizonData";

interface PlanningCalendarProps {
  selectedDate: string; // e.g. "2026-09-17"
  onSelectDate: (date: string) => void;
  viewMode?: "month" | "week";
}

export function PlanningCalendar({
  selectedDate,
  onSelectDate,
  viewMode = "month",
}: PlanningCalendarProps) {
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // 1 Sep 2026 was a Tuesday, so Monday 31 Aug is the single leading offset
  const leadingDays = [
    { date: "2026-08-31", dayNum: 31, isCurrentMonth: false, jobsCount: 1 },
  ];

  const currentMonthDays = SEPTEMBER_CALENDAR.map((d) => ({
    ...d,
    isCurrentMonth: true,
  }));

  // Trailing padding to complete the 35-cell grid (5 full weeks)
  const trailingDays = [
    { date: "2026-10-01", dayNum: 1, isCurrentMonth: false, jobsCount: 2 },
    { date: "2026-10-02", dayNum: 2, isCurrentMonth: false, jobsCount: 1 },
    { date: "2026-10-03", dayNum: 3, isCurrentMonth: false, jobsCount: 0 },
    { date: "2026-10-04", dayNum: 4, isCurrentMonth: false, jobsCount: 0 },
  ];

  const allMonthCells = [...leadingDays, ...currentMonthDays, ...trailingDays];

  // If in week mode, extract the 7 days containing selectedDate or 14-20 Sep
  const selectedDayObj = SEPTEMBER_CALENDAR.find((d) => d.date === selectedDate) ?? SEPTEMBER_CALENDAR[16]; // 17th
  const dayIndex = SEPTEMBER_CALENDAR.indexOf(selectedDayObj);
  // Find start of week containing day
  const weekStartIdx = Math.max(0, Math.floor(dayIndex / 7) * 7);
  const weekDays = SEPTEMBER_CALENDAR.slice(weekStartIdx, weekStartIdx + 7);

  if (viewMode === "week") {
    return (
      <div className="rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#171a30]">
              Weekly Planning Board · September 2026
            </h2>
            <span className="rounded bg-[#eef0fa] px-2 py-0.5 font-mono text-[10px] font-bold text-[#2e3092]">
              Multi-day Comparison
            </span>
          </div>
          <span className="text-xs text-[#878da1]">Click any day to inspect its full timeline</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weekDays.map((d) => {
            const isSelected = d.date === selectedDate;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onSelectDate(d.date)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-[#2e3092] bg-[#f5f6fc] ring-2 ring-[#2e3092]/30 shadow-xs"
                    : "border-[#e3e6f0] bg-white hover:border-[#2e3092]/50 hover:bg-[#fafbfd]"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className={`text-xs font-bold ${isSelected ? "text-[#2e3092]" : "text-[#171a30]"}`}>
                    {d.dayName} {d.dayNum}
                  </span>
                  {d.hasCritical && <span className="h-2 w-2 rounded-full bg-[#dc2626]" title="Critical work" />}
                  {d.hasDeadlineRisk && <span className="h-2 w-2 rounded-full bg-[#d97706]" title="Deadline risk" />}
                </div>

                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="font-mono text-xl font-extrabold text-[#171a30]">{d.jobsCount}</span>
                  <span className="text-[10px] text-[#878da1]">jobs · {d.blocksCount} blk</span>
                </div>

                <div className="mt-2">
                  <UtilBar pct={d.utilization} tone={d.utilization >= 75 ? OK : d.utilization >= 50 ? WARN : "#94a3b8"} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-[#878da1]">
                  <span>{d.utilization}% util</span>
                  {d.trainImpactMinutes > 0 && <span className="text-[#d97706]">+{d.trainImpactMinutes}m</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Month View
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-[#e3e6f0] bg-white p-4 shadow-xs">
      <div>
        {/* Calendar Header with Navigation */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#171a30]">September 2026</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
              title="Previous Month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="rounded p-1 text-[#878da1] hover:bg-[#f1f3f9] hover:text-[#171a30]"
              title="Next Month"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => onSelectDate("2026-09-17")}
              className="ml-1 rounded border border-[#d9ddef] bg-[#f8f9fd] px-2 py-0.5 text-[10px] font-bold text-[#2e3092] hover:bg-[#eef0fa]"
            >
              Today
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] font-bold uppercase text-[#878da1] pb-1.5 border-b border-[#eef0f6]">
          {weekdays.map((w) => (
            <div key={w} className="py-0.5">
              {w}
            </div>
          ))}
        </div>

        {/* 5-Week Month Grid */}
        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {allMonthCells.map((cell, idx) => {
            const isSelected = cell.date === selectedDate;
            const isCurrent = cell.isCurrentMonth;
            const dayData = SEPTEMBER_CALENDAR.find((d) => d.date === cell.date);

            return (
              <button
                key={`${cell.date}-${idx}`}
                type="button"
                onClick={() => onSelectDate(cell.date)}
                className={`relative flex flex-col justify-between rounded-lg p-1.5 text-left transition-all min-h-[52px] ${
                  isSelected
                    ? "border-2 border-[#2e3092] bg-[#f0f2fb] shadow-xs"
                    : isCurrent
                      ? "border border-[#edf0f7] bg-white hover:border-[#c5cae5] hover:bg-[#fcfdfe]"
                      : "border border-transparent bg-[#f8f9fc]/50 opacity-40 hover:opacity-75"
                }`}
              >
                {/* Day number & indicators */}
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-xs font-bold ${
                      isSelected
                        ? "text-[#2e3092] font-black"
                        : isCurrent
                          ? "text-[#171a30]"
                          : "text-[#878da1]"
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {dayData && (
                    <div className="flex items-center gap-0.5">
                      {dayData.hasCritical && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#dc2626]" title="Critical job scheduled" />
                      )}
                      {dayData.hasDeadlineRisk && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#d97706]" title="Upcoming deadline" />
                      )}
                    </div>
                  )}
                </div>

                {/* Job Count badge */}
                <div className="mt-1">
                  {cell.jobsCount > 0 ? (
                    <div
                      className={`truncate rounded px-1 py-0.5 font-mono text-[9px] font-bold ${
                        isSelected
                          ? "bg-[#2e3092] text-white"
                          : dayData?.isHighWorkload
                            ? "bg-[#eef0fa] text-[#2e3092]"
                            : "bg-[#f1f3f9] text-[#4d5468]"
                      }`}
                    >
                      {cell.jobsCount} {cell.jobsCount === 1 ? "job" : "jobs"}
                    </div>
                  ) : (
                    <span className="font-mono text-[9px] text-[#cbd5e1] pl-1">0</span>
                  )}
                </div>

                {/* Selected day bottom bar */}
                {isSelected && (
                  <div className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full bg-[#2e3092]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer legend */}
      <div className="mt-2.5 flex items-center justify-between border-t border-[#eef0f6] pt-2 text-[10px] text-[#878da1]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#dc2626]" /> Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d97706]" /> Deadline
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded bg-[#eef0fa]" /> Heavy plan
          </span>
        </div>
        <span className="font-mono text-[9px]">Click date to view details</span>
      </div>
    </div>
  );
}
