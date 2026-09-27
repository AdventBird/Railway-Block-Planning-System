// ---------------------------------------------------------------------------
// COMMAND CENTER — "What needs my attention right now?"
// 5 KPIs → attention list → tonight's plan strip → data-source footer.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, CircleAlert, Info, Radio } from "lucide-react";
import {
  Button,
  DecisionCard,
  MetaText,
  MetricCard,
  PageHeader,
  SectionBlock,
  StatusBadge,
  PRIMARY,
  OK,
  CRIT,
  WARN,
  type ViewId,
} from "./ui";
import { AlertDrawer, TrainDrawer, WindowDrawer, type WinRef } from "./drawers";
import { alerts, blockWindows, DATA_SOURCES, PLAN_DATE, existingBlocks, trains, type Alert, type Train } from "../data/opsData";
import { recommendedPlan, trainImpactMinutes } from "../data/planData";
import { planStats, spanMinutes } from "../lib/plan";
import { getPlannerResult } from "../api/planner";
import type { PlannerResult } from "../api/types";
import { Timeline, TimelineLegend, buildSummaryLanes, type TimelineBar } from "./Timeline";
import { buildQualityMetricsFromPlan } from "./PlannerKpiCard";
import { UtilBar } from "./TimelineUtil";

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
  const [showAllActions, setShowAllActions] = useState(false);
  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null);

  useEffect(() => {
    let active = true;
    getPlannerResult().then((res) => {
      if (active) setPlannerResult(res);
    });
    return () => {
      active = false;
    };
  }, []);

  // Metrics follow the LIVE plan when the backend has one (PART 6 — one owner
  // for interval arithmetic); planStats is the offline/seed fallback renderer.
  const seedStats = planStats(
    blockWindows.map((w) => ({ id: w.id, minutes: w.minutes })),
    recommendedPlan.assignments
  );
  const liveMetrics = plannerResult?.source.status === "live" ? plannerResult.metrics : null;
  const stats =
    liveMetrics && (liveMetrics.utilization !== undefined || liveMetrics.blocks !== undefined)
      ? {
          blocks: liveMetrics.blocks ?? seedStats.blocks,
          jobs: liveMetrics.scheduled ?? seedStats.jobs,
          utilization: liveMetrics.utilization ?? 0,
          windowMinutes: liveMetrics.windowMinutes ?? seedStats.windowMinutes,
          occupiedMinutes: liveMetrics.occupiedMinutes ?? seedStats.occupiedMinutes,
          unusedMinutes: liveMetrics.unusedMinutes ?? seedStats.unusedMinutes,
        }
      : seedStats;
  // Same derivation the Approval screen shows — one definition per metric (§metric consistency).
  const criticalOverdue = Number(buildQualityMetricsFromPlan(plannerResult).criticalBacklog) || 0;
  const pending = existingBlocks.filter((b) => b.status === "pending").length;
  const deferredCount =
    plannerResult?.source.status === "live"
      ? plannerResult.deferred.length
      : recommendedPlan.deferred.length;
  const isLive = plannerResult?.source.status === "live";
  // "Tonight's plan" timeline mirrors the actual planner output (seed fallback offline).
  const summaryLanes = useMemo(
    () => buildSummaryLanes(plannerResult?.assignments ?? []),
    [plannerResult]
  );

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
      <PageHeader
        title="Command Center"
        subtitle={PLAN_DATE}
        meta={
          <>
            <MetaText>NDLS–BSB TRUNK</MetaText>
            <MetaText>DEMO DATA · SYNTHETIC FEEDS</MetaText>
          </>
        }
        right={
          <Button variant="secondary" onClick={() => onNavigate("workspace")}>
            Open Planning Workspace
          </Button>
        }
      />

      {/* L1 — status & attention answer "what needs me?" in one glance */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <DecisionCard
          title="Plan status"
          badge={
            <StatusBadge
              label={approvalPending ? "Pending approval" : "Decision recorded"}
              tone={approvalPending ? WARN : OK}
              pulse={approvalPending}
            />
          }
        >
          <div className="flex h-full flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="value-lg text-[#171a30]">
                  Plan r3 · {stats.jobs} jobs · {stats.blocks} blocks
                </div>
                <div className="mt-1 text-xs text-[#4d5468]">
                  {stats.windowMinutes} min window capacity · 22:00–08:00
                  {pending > 0 ? ` · ${pending} pending request${pending > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="font-mono text-[22px] font-bold leading-none"
                  style={{ color: stats.utilization >= 85 ? OK : PRIMARY }}
                >
                  {stats.utilization}%
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">
                  utilization
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <UtilBar pct={stats.utilization} tone={stats.utilization >= 85 ? OK : PRIMARY} />
              <div>
                {approvalPending ? (
                  <Button onClick={() => onNavigate("approval")}>Review plan →</Button>
                ) : (
                  <Button variant="secondary" onClick={() => onNavigate("workspace")}>
                    Open workspace →
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DecisionCard>

        <DecisionCard
          title="Action required"
          accent={CRIT}
          badge={<StatusBadge label={`${attention.length} items`} tone={CRIT} />}
        >
          <div className="-mx-4 -my-1 divide-y divide-[#eef0f6]">
            {(showAllActions ? attention : attention.slice(0, 3)).map((a, i) => (
              <button
                key={i}
                onClick={a.open}
                className="focus-primary flex w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-200 hover:bg-[#f5f6fc]"
              >
                <span style={{ color: a.tone }}>{a.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[#171a30]">{a.title}</span>
                  <span className="block truncate text-[11px] text-[#878da1]">{a.meta}</span>
                </span>
                <ChevronRight size={14} className="shrink-0 text-[#a2a7ba]" />
              </button>
            ))}
            {!showAllActions && attention.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllActions(true)}
                className="focus-primary w-full px-4 py-2 text-left text-[11px] font-bold text-[#2e3092] transition-colors duration-200 hover:bg-[#f5f6fc]"
              >
                View all {attention.length} →
              </button>
            )}
          </div>
        </DecisionCard>
      </div>

      {/* L2 — tonight's plan */}
      <SectionBlock
        className="mb-6"
        title="Tonight's plan"
        description="22:00 → 08:00 · click any bar for details"
        right={
          <button
            onClick={() => onNavigate("workspace")}
            className="focus-primary text-[11px] font-bold text-[#2e3092] hover:text-[#24266f]"
          >
            Full workspace →
          </button>
        }
      >
        <TimelineLegend />
        <Timeline lanes={summaryLanes} onPick={pick} />
      </SectionBlock>

      {/* Core metrics — critical/overdue visibly dominant */}
      <h3 className="section-title mb-3 text-[#878da1]">Core metrics</h3>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          level="primary"
          tone={CRIT}
          label="Critical / overdue"
          value={criticalOverdue}
          context="Tier 0–2 work awaiting a window"
        />
        <MetricCard label="Jobs scheduled" value={stats.jobs} context={`across ${stats.blocks} blocks`} tone={OK} />
        <MetricCard label="Jobs deferred" value={deferredCount} context="held for future windows" tone={WARN} />
        <MetricCard
          label="Train impact"
          value={isLive ? `${(plannerResult?.trainImpact ?? []).length} paths` : `${trainImpactMinutes} min`}
          context={isLive ? "protected movements held" : "freight regulation tonight"}
          tone={WARN}
        />
        <MetricCard
          label="Block utilization"
          value={`${stats.utilization}%`}
          context="occupied ÷ window minutes"
          tone={PRIMARY}
        />
      </div>

      {/* L3 — data provenance, deliberately quiet */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#e3e6f0] bg-white px-4 py-2.5">
        <span className="flex items-center gap-1.5">
          <Radio size={11} className="text-[#16a34a]" />
          <MetaText>DEMO DATA · SYNTHETIC SOURCES</MetaText>
        </span>
        {DATA_SOURCES.map((s) => (
          <span key={s.id} title={s.label}>
            <MetaText>{s.id}</MetaText>
          </span>
        ))}
        <MetaText className="ml-auto">No live railway connection — simulated feeds</MetaText>
      </div>

      {alert && <AlertDrawer alert={alert} onClose={() => setAlert(null)} />}
      {train && <TrainDrawer trainId={train.id} onClose={() => setTrain(null)} />}
      {win && <WindowDrawer win={win} onClose={() => setWin(null)} />}
    </div>
  );
}

export default CommandCenter;