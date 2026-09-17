// ---------------------------------------------------------------------------
// PLANNING WORKSPACE — the most important screen (§9).
// Header (Tonight / Week / Month) · LEFT: work to schedule · CENTER: railway
// timeline · RIGHT: recommended block plan · BOTTOM: deferred & conflicts.
// ---------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { Card, Chip, TierChip, CompatChip, ReasonChip, Button, OK, PRIMARY, type ViewId } from "./ui";
import { JobDrawer, WindowDrawer, TrainDrawer, CompatDrawer, ConflictDrawer, type WinRef } from "./drawers";
import { WeekView, MonthView } from "./PlanningCalendar";
import { Timeline, TimelineLegend, buildPlanLanes, type TimelineBar } from "./Timeline";
import { UtilBar } from "./TimelineUtil";
import { blockWindows, corridorLabel, existingBlocks, PLAN_DATE, trains } from "../data/opsData";
import { compatGroups, jobById, jobs, type Job } from "../data/jobsData";
import { conflictEntries, recommendedPlan } from "../data/planData";
import { occupiedUnion, planStats, spanMinutes } from "../lib/plan";

type Horizon = "tonight" | "week" | "month";

interface WorkspaceProps {
  onNavigate: (v: ViewId) => void;
  /** Window to preselect (e.g. after the Planning Assistant prepares a draft). */
  initialWindowId?: string;
}

export function windowRefOf(id: string): WinRef {
  const w = blockWindows.find((x) => x.id === id);
  if (w)
    return { id: w.id, label: w.id, corridorId: w.corridorId, start: w.start, end: w.end, minutes: w.minutes, kind: "proposed", note: w.note };
  const b = existingBlocks.find((x) => x.id === id)!;
  return {
    id: b.id,
    label: b.blockId,
    corridorId: b.corridorId,
    start: b.start,
    end: b.end,
    minutes: spanMinutes(b.start, b.end),
    kind: "existing",
    blockId: b.blockId,
    status: b.status,
    work: b.work,
  };
}

function Workspace({ onNavigate, initialWindowId }: WorkspaceProps) {
  const [horizon, setHorizon] = useState<Horizon>("tonight");
  const [selectedId, setSelectedId] = useState<string>(initialWindowId ?? "W1");
  const [job, setJob] = useState<Job | null>(null);
  const [trainId, setTrainId] = useState<string | null>(null);
  const [winDrawerId, setWinDrawerId] = useState<string | null>(null);
  const [compatId, setCompatId] = useState<string | null>(null);
  const [conflictSubject, setConflictSubject] = useState<string | null>(null);

  const lanes = useMemo(() => buildPlanLanes(), []);
  const stats = useMemo(
    () => planStats(blockWindows.map((w) => ({ id: w.id, minutes: w.minutes })), recommendedPlan.assignments),
    []
  );

  const selected = windowRefOf(selectedId);
  const selectedJobs = recommendedPlan.assignments.filter((a) => a.windowId === selectedId);
  const selectedDepts = [...new Set(selectedJobs.map((a) => jobById(a.jobId)?.dept ?? "").filter(Boolean))];
  const selectedImpact = recommendedPlan.trainImpact.filter((t) => t.includes(selectedId)).length;
  const selectedCompat = compatGroups.find((g) => g.corridorId === selected.corridorId);
  const selectedDeferred = recommendedPlan.deferred.filter((d) => jobById(d.jobId)?.corridorId === selected.corridorId);

  const pick = (b: TimelineBar) => {
    if (b.trainId) {
      setTrainId(b.trainId);
      return;
    }
    if (b.winId) {
      if (b.kind === "window" || b.kind === "job") setSelectedId(b.winId);
      setWinDrawerId(b.winId);
    }
  };

  const isolationConflict = conflictEntries.find((c) => c.code === "ISOLATION_CONFLICT") ?? conflictEntries[0];

  if (horizon !== "tonight") {
    return (
      <div>
        <WorkspaceHeader horizon={horizon} setHorizon={setHorizon} />
        {horizon === "week" ? <WeekView /> : <MonthView />}
      </div>
    );
  }

  return (
    <div>
      <WorkspaceHeader horizon={horizon} setHorizon={setHorizon} />
      <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* ------------------------------ LEFT ------------------------------ */}
        <Card className="thin-scroll max-h-[600px] overflow-y-auto p-0">
          <div className="sticky top-0 z-10 border-b border-[#eef0f6] bg-white px-4 py-2.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">Work to schedule</div>
            <div className="text-[10px] text-[#878da1]">{jobs.length} jobs · Tier 0–4 rulebook</div>
          </div>
          <div className="divide-y divide-[#eef0f6]">
            {[0, 1, 2, 3, 4].flatMap((tier) =>
              jobs
                .filter((j) => j.tier === tier)
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((j) => {
                  const sched = recommendedPlan.assignments.find((a) => a.jobId === j.id);
                  const def = recommendedPlan.deferred.find((d) => d.jobId === j.id);
                  return (
                    <button
                      key={j.id}
                      onClick={() => setJob(j)}
                      className="focus-primary block w-full px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
                    >
                      <div className="flex items-center gap-2">
                        <TierChip tier={j.tier} compact />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold text-[#171a30]">
                          <span className="font-mono text-[10px] text-[#878da1]">{j.id}</span> {j.title}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-[#878da1]">
                        <span className="font-semibold text-[#4d5468]">{j.dept}</span>
                        <span>·</span>
                        <span className="truncate">{corridorLabel(j.corridorId)}</span>
                        <span className="ml-auto shrink-0 font-mono">{j.minutes}m</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                        <span className="truncate text-[#878da1]">Due {j.deadline}</span>
                        {sched && <Chip label={`Scheduled ${sched.start}`} color={OK} bg="#f0fdf4" />}
                        {def && <ReasonChip code={def.code} />}
                      </div>
                    </button>
                  );
                })
            )}
          </div>
        </Card>
        {/* ----------------------------- CENTER ----------------------------- */}
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">Railway timeline</div>
              <div className="text-[10px] text-[#878da1]">22:00 → 08:00 · click any bar for details</div>
            </div>
            <div className="flex gap-1.5 font-mono text-[10px] text-[#878da1]">
              <span>{stats.jobs} jobs</span>
              <span>·</span>
              <span>{stats.windowMinutes} min windows</span>
              <span>·</span>
              <span>{stats.utilization}% utilized</span>
            </div>
          </div>
          <TimelineLegend />
          <Timeline lanes={lanes} onPick={pick} />
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#eef0f6] pt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Committed resources:</span>
            {["BCM-03 (W2)", "REMM-2 (W1)", "TW-925 (E3·W3)", "Lamp party (W1)", "OHE crews A+B"].map((r) => (
              <span key={r} className="rounded-full border border-[#e3e6f0] bg-[#f5f6fc] px-2 py-0.5 font-mono text-[10px] text-[#4d5468]">
                {r}
              </span>
            ))}
          </div>
        </Card>
        {/* ------------------------------ RIGHT ----------------------------- */}
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">Recommended block plan</div>
              <span className="font-mono text-[10px] font-bold text-[#2e3092]">PLAN r3</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-mono text-lg font-extrabold leading-none text-[#171a30]">{stats.blocks}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">blocks</div>
              </div>
              <div>
                <div className="font-mono text-lg font-extrabold leading-none text-[#171a30]">{stats.jobs}</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">jobs</div>
              </div>
              <div>
                <div className="font-mono text-lg font-extrabold leading-none text-[#171a30]">{stats.utilization}%</div>
                <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#878da1]">utilized</div>
              </div>
            </div>
            <div className="mt-2">
              <UtilBar pct={stats.utilization} tone={PRIMARY} />
            </div>
          </Card>

          {/* Selected block decision card */}
          <Card className="border-[#2e3092]/40 p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#878da1]">Recommended block</div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <div className="truncate text-sm font-extrabold text-[#171a30]">{corridorLabel(selected.corridorId)}</div>
              <span className="shrink-0 font-mono text-[11px] font-bold text-[#2e3092]">{selected.id}</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-[#4d5468]">
              {selected.start}–{selected.end} · {selected.minutes} min
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-[#e3e6f0] px-1 py-1.5">
                <div className="font-mono text-sm font-extrabold text-[#171a30]">{selectedJobs.length}</div>
                <div className="text-[9px] uppercase tracking-wider text-[#878da1]">jobs</div>
              </div>
              <div className="rounded-lg border border-[#e3e6f0] px-1 py-1.5">
                <div className={`font-mono text-sm font-extrabold ${selectedImpact > 0 ? "text-[#d97706]" : "text-[#16a34a]"}`}>
                  {selectedImpact === 0 ? "Low" : selectedImpact === 1 ? "1 reg" : `${selectedImpact} regs`}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#878da1]">impact</div>
              </div>
              <div className="rounded-lg border border-[#e3e6f0] px-1 py-1.5">
                <div className={`font-mono text-sm font-extrabold ${selectedDeferred.length > 0 ? "text-[#d97706]" : "text-[#16a34a]"}`}>
                  {selectedDeferred.length === 0 ? "Met" : `${selectedDeferred.length} def`}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#878da1]">deadline</div>
              </div>
            </div>

            {selectedDepts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedDepts.map((d) => (
                  <Chip key={d} label={d} color="#4d5468" bg="#f1f3f9" />
                ))}
              </div>
            )}

            {selectedCompat && (
              <button
                onClick={() => setCompatId(selectedCompat.id)}
                className="focus-primary mt-2.5 flex w-full items-center justify-between rounded-lg border border-[#e3e6f0] px-3 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Compatibility</span>
                  <CompatChip status={selectedCompat.status} />
                </span>
                <span className="text-[11px] font-bold text-[#2e3092]">Why?</span>
              </button>
            )}

            <p className="mt-2.5 rounded-lg bg-[#f5f6fc] px-3 py-2 text-[11px] leading-relaxed text-[#4d5468]">
              “
              {selected.kind === "proposed"
                ? `Compatible work consolidated into one possession during a low-impact window — ${selected.note ?? "traffic gap between premier paths"}.`
                : "Already-sanctioned possession — compatible recommended work rides inside it."}
              ”
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button onClick={() => onNavigate("approval")}>Approve</Button>
              <Button variant="secondary" onClick={() => onNavigate("approval")}>
                Modify
              </Button>
              <Button variant="secondary" onClick={() => onNavigate("simulation")}>
                Simulate
              </Button>
            </div>
          </Card>
          {/* Compatibility groups — compact list */}
          <Card className="p-0">
            <div className="border-b border-[#eef0f6] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
              Compatibility groups
            </div>
            <div className="divide-y divide-[#eef0f6]">
              {compatGroups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setCompatId(g.id)}
                  className="focus-primary flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] font-bold text-[#171a30]">
                      <span className="font-mono text-[10px] text-[#878da1]">{g.id}</span> {g.title}
                    </span>
                    <span className="text-[10px] text-[#878da1]">{corridorLabel(g.corridorId)}</span>
                  </span>
                  <CompatChip status={g.status} />
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {/* ------------------------- BOTTOM SUMMARY ------------------------- */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="p-0">
          <div className="border-b border-[#eef0f6] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
            Deferred <span className="text-[#878da1]">· {recommendedPlan.deferred.length}</span>
          </div>
          <div className="divide-y divide-[#eef0f6]">
            {recommendedPlan.deferred.map((d) => (
              <button
                key={d.jobId}
                onClick={() => {
                  const j = jobById(d.jobId);
                  if (j) setJob(j);
                }}
                className="focus-primary flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
              >
                <span className="min-w-0 truncate text-[11px] font-semibold text-[#171a30]">
                  <span className="font-mono text-[10px] text-[#878da1]">{d.jobId}</span> {jobById(d.jobId)?.title}
                </span>
                <ReasonChip code={d.code} />
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-0">
          <div className="border-b border-[#eef0f6] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
            Conflict <span className="text-[#878da1]">· 1 isolation</span>
          </div>
          <button
            onClick={() => setConflictSubject(isolationConflict.subject)}
            className="focus-primary flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[11px] font-bold text-[#171a30]">{isolationConflict.subject}</span>
              <span className="text-[10px] text-[#878da1]">Click for the full story — what it means</span>
            </span>
            <ReasonChip code={isolationConflict.code} />
          </button>
        </Card>

        <Card className="p-0">
          <div className="border-b border-[#eef0f6] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
            Unused window capacity <span className="text-[#878da1]">· {stats.unusedMinutes} min</span>
          </div>
          <div className="divide-y divide-[#eef0f6]">
            {blockWindows.map((w) => {
              const used = occupiedUnionOf(w.id);
              const unused = w.minutes - used;
              return (
                <button
                  key={w.id}
                  onClick={() => setWinDrawerId(w.id)}
                  className="focus-primary flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
                >
                  <span className="text-[11px] font-semibold text-[#171a30]">
                    {w.id} · {corridorLabel(w.corridorId)}
                  </span>
                  <span className={`font-mono text-[11px] font-bold ${unused > 0 ? "text-[#d97706]" : "text-[#16a34a]"}`}>
                    {unused > 0 ? `${unused} min free` : "full"}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ----------------------------- DRAWERS ----------------------------- */}
      {job && <JobDrawer job={job} onClose={() => setJob(null)} />}
      {trainId && <TrainDrawer train={trains.find((t) => t.id === trainId)!} onClose={() => setTrainId(null)} />}
      {winDrawerId && <WindowDrawer win={windowRefOf(winDrawerId)} onClose={() => setWinDrawerId(null)} />}
      {compatId && <CompatDrawer group={compatGroups.find((g) => g.id === compatId)!} onClose={() => setCompatId(null)} />}
      {conflictSubject && (
        <ConflictDrawer entry={conflictEntries.find((c) => c.subject === conflictSubject)!} onClose={() => setConflictSubject(null)} />
      )}
    </div>
  );
}

/** Occupied union minutes for one proposed window (from the plan assignments). */
function occupiedUnionOf(windowId: string): number {
  return occupiedUnion(recommendedPlan.assignments.filter((a) => a.windowId === windowId));
}

/** Workspace header — title, planning date, Tonight / Week / Month switch. */
function WorkspaceHeader({ horizon, setHorizon }: { horizon: Horizon; setHorizon: (h: Horizon) => void }) {
  const items: { id: Horizon; label: string }[] = [
    { id: "tonight", label: "Tonight" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-bold tracking-wide text-[#171a30]">Planning Workspace</h2>
        <p className="mt-0.5 text-xs text-[#878da1]">{PLAN_DATE} · NDLS–BSB trunk · authorize only via Human Approval</p>
      </div>
      <div className="flex rounded-lg border border-[#e3e6f0] bg-white p-0.5">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => setHorizon(it.id)}
            className={`focus-primary rounded-md px-3 py-1 text-[11px] font-bold transition-colors duration-200 ${
              horizon === it.id ? "bg-[#2e3092] text-white" : "text-[#4d5468] hover:bg-[#f5f6fc]"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Workspace;