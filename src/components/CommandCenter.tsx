// ---------------------------------------------------------------------------
// COMMAND CENTER — "What needs my attention right now?"
// 5 KPIs → attention list → tonight's plan strip → data-source footer.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { AlertTriangle, ChevronRight, CircleAlert, Info, Radio } from "lucide-react";
import { Card, Kpi, SectionHeader, Button, PRIMARY, OK, CRIT, WARN, type ViewId } from "./ui";
import { AlertDrawer, TrainDrawer, WindowDrawer, type WinRef } from "./drawers";
import { alerts, blockWindows, DATA_SOURCES, existingBlocks, trains, type Alert, type Train } from "../data/opsData";
import { jobs } from "../data/jobsData";
import { recommendedPlan } from "../data/planData";
import { planStats, spanMinutes } from "../lib/plan";
import { Timeline, TimelineLegend, buildSummaryLanes, type TimelineBar } from "./Timeline";

interface CommandCenterProps {
  onNavigate: (v: ViewId) => void;
  approvalPending: boolean;
  onOpenAssistant: (scenario: "find" | "reserve") => void;
}

export function windowRefs(): WinRef[] {
  const mk = (w: (typeof blockWindows)[number]): WinRef => ({
    id: w.id,
    label: w.id,
    corridorId: w.corridorId,
    start: w.start,
    end: w.end,
    minutes: w.minutes,
    kind: "proposed",
    note: w.note,
  });
  const mkE = (b: (typeof existingBlocks)[number]): WinRef => ({
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
  });
  return [...blockWindows.map(mk), ...existingBlocks.map(mkE)];
}

function CommandCenter({ onNavigate, approvalPending, onOpenAssistant }: CommandCenterProps) {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [train, setTrain] = useState<Train | null>(null);
  const [win, setWin] = useState<WinRef | null>(null);

  const stats = planStats(
    blockWindows.map((w) => ({ id: w.id, minutes: w.minutes })),
    recommendedPlan.assignments
  );
  const criticalOverdue = jobs.filter((j) => j.tier <= 2).length;
  const pending = existingBlocks.filter((b) => b.status === "pending").length;
  const windowMinutes = blockWindows.reduce((a, w) => a + w.minutes, 0);

  const attention: {
    icon: React.ReactNode;
    tone: string;
    title: string;
    meta: string;
    open: () => void;
  }[] = [
    {
      icon: <CircleAlert size={15} />,
      tone: CRIT,
      title: alerts[0].title,
      meta: `${alerts[0].time} IST · ${alerts[0].section}`,
      open: () => setAlert(alerts[0]),
    },
    {
      icon: <AlertTriangle size={15} />,
      tone: WARN,
      title: alerts[1].title,
      meta: `${alerts[1].time} IST · act before 03:00`,
      open: () => setAlert(alerts[1]),
    },
    {
      icon: <Info size={15} />,
      tone: PRIMARY,
      title: "Relief train path requested — NDLS–GZB 02:30–03:30",
      meta: "Draft event from the control desk — reserve & replan",
      open: () => onOpenAssistant("reserve"),
    },
    {
      icon: <AlertTriangle size={15} />,
      tone: WARN,
      title: alerts[2].title,
      meta: `${alerts[2].time} IST · ${alerts[2].section}`,
      open: () => setAlert(alerts[2]),
    },
  ];

  const pick = (b: TimelineBar) => {
    if (b.trainId) {
      const t = trains.find((x) => x.id === b.trainId);
      if (t) setTrain(t);
      return;
    }
    if (b.winId) setWin(windowRefs().find((w) => w.id === b.winId) ?? null);
  };

  return (
    <div>
      <SectionHeader
        title="Command Center"
        subtitle="NDLS–BSB trunk · what needs your attention right now"
        right={
          approvalPending ? (
            <Button onClick={() => onNavigate("approval")}>
              Plan r3 awaits approval
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onNavigate("workspace")}>
              Open Planning Workspace
            </Button>
          )
        }
      />

      {/* KPI row — five numbers, nothing more */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Kpi value={String(criticalOverdue)} label="Critical / overdue" context="Tier 0–2 jobs tonight" tone={CRIT} />
        <Kpi value={String(blockWindows.length)} label="Block windows" context={`${windowMinutes} min · 22:00–08:00`} />
        <Kpi value={String(pending)} label="Pending requests" context="BLK-2026-0417 closes 03:00" tone={WARN} />
        <Kpi
          value={String(stats.blocks)}
          label="Recommended blocks"
          context={`${stats.jobs} jobs · ${stats.utilization}% utilized`}
          tone={PRIMARY}
        />
        <Kpi value="Low" label="Operational impact" context="3 minor freight regulations" tone={OK} />
      </div>

      {/* Attention required — 4 items, every one clickable */}
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#878da1]">Attention required</h3>
      <Card className="mb-5 divide-y divide-[#eef0f6]">
        {attention.map((a, i) => (
          <button
            key={i}
            onClick={a.open}
            className="focus-primary flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
          >
            <span style={{ color: a.tone }}>{a.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-[#171a30]">{a.title}</span>
              <span className="block truncate text-[11px] text-[#878da1]">{a.meta}</span>
            </span>
            <ChevronRight size={14} className="shrink-0 text-[#a2a7ba]" />
          </button>
        ))}
      </Card>

      {/* Tonight's plan — compact strip */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#878da1]">Tonight's plan</h3>
        <button
          onClick={() => onNavigate("workspace")}
          className="focus-primary text-[11px] font-bold text-[#2e3092] hover:text-[#24266f]"
        >
          Full workspace →
        </button>
      </div>
      <Card className="mb-5 p-4">
        <TimelineLegend />
        <Timeline lanes={buildSummaryLanes()} compact onPick={pick} />
      </Card>

      {/* Data sources — all simulated */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-[#e3e6f0] bg-white px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
          <Radio size={12} className="text-[#16a34a]" /> Data sources
        </span>
        {DATA_SOURCES.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4d5468]" title={s.label}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
            {s.id}
          </span>
        ))}
        <span className="ml-auto rounded border border-[#d9ddef] bg-[#f5f6fc] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
          Simulated
        </span>
      </div>

      {alert && <AlertDrawer alert={alert} onClose={() => setAlert(null)} />}
      {train && <TrainDrawer train={train} onClose={() => setTrain(null)} />}
      {win && <WindowDrawer win={win} onClose={() => setWin(null)} />}
    </div>
  );
}

export default CommandCenter;