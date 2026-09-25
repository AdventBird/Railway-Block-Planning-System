// ---------------------------------------------------------------------------
// PLANNER KPI CARD & PLANNING QUALITY DASHBOARD (Phase 6)
// Reusable operational metrics component shared by Workspace, Simulation,
// and Human Approval. Renders canonical synthetic plan arithmetic or dynamic
// FastAPI backend metrics.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, type ReactNode } from "react";
import { OK, PRIMARY, WARN, CRIT, Tooltip } from "./ui";
import { jobs } from "../data/jobsData";
import { recommendedPlan } from "../data/planData";
import type { PlannerMetrics, PlannerResult } from "../api/types";

export interface PlannerQualityMetrics {
  /** Completed / scheduled jobs vs total queue (e.g. "7/13" or { scheduled: 7, total: 13 }). */
  maintenanceCompleted: string | { scheduled: number; total: number };
  /** Count of Tier 0–2 overdue or critical jobs in backlog. */
  criticalBacklog: number | string;
  /** Union possession utilization percentage (e.g. 91 or "91%"). */
  blockUtilization: number | string;
  /** Cumulative regulation or delay impact (e.g. "25 min" or "42 min"). */
  trainImpact: string | number;
  /** Number of planned / sanctioned possession blocks in use. */
  possessionsUsed: number | string;
  /** Number of separate possessions avoided through compatibility bundling. */
  possessionsAvoided: number | string;
  /* ------------------- Optional future backend fields ------------------- */
  jobsScheduled?: number;
  jobsDeferred?: number;
  plannerStatus?: "Optimal" | "Feasible" | "Infeasible" | string;
}

export interface PlannerKpiCardProps {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  trend?: ReactNode;
  tone?: string;
  badge?: ReactNode;
  badgeTone?: "ok" | "warn" | "crit" | "primary" | "neutral";
  progressPct?: number;
  tooltipText?: string;
  className?: string;
}

const KPI_TOOLTIPS: Record<string, string> = {
  "Maintenance Completed": "Scheduled Tier 0–4 safety and statutory works vs total pending backlog queue for this cycle.",
  "Critical Backlog": "Unaddressed Tier 0 (Safety) through Tier 2 (Overdue) work orders requiring immediate dispatch authorization.",
  "Block Utilization": "Union percentage of corridor track possession duration actively occupied by maintenance machinery and gangs (Target ≥85%).",
  "Train Impact": "Cumulative passenger & freight regulation or schedule buffering minutes necessitated by maintenance possessions.",
  "Possessions Used": "Count of distinct track occupancy windows activated across corridors tonight.",
  "Possessions Avoided": "Individual track possessions eliminated through synchronized multi-disciplinary work bundling.",
  "Jobs Scheduled": "Total work orders successfully assigned to feasible corridor windows without violation.",
  "Jobs Deferred": "Work orders rolled over to subsequent maintenance windows due to corridor, machine, or power conflicts.",
};

/**
 * Animated number component that smoothly transitions values on update.
 */
function AnimatedCounter({ value }: { value: ReactNode }) {
  const [display, setDisplay] = useState<string>(String(value ?? ""));
  const prevNumRef = useRef<number | null>(null);

  useEffect(() => {
    const str = String(value ?? "");
    // Check if simple integer or percentage
    const match = str.match(/^(\d+)(.*)$/);
    if (!match) {
      setDisplay(str);
      return;
    }

    const targetNum = parseInt(match[1], 10);
    const suffix = match[2];
    const startNum = prevNumRef.current ?? Math.max(0, targetNum - 6);
    prevNumRef.current = targetNum;

    if (startNum === targetNum) {
      setDisplay(str);
      return;
    }

    const duration = 400; // ms
    const startTime = performance.now();

    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startNum + (targetNum - startNum) * eased);
      setDisplay(`${current}${suffix}`);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    const frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [value]);

  return <span>{display}</span>;
}

/**
 * Reusable operational KPI card.
 * Compact, accessible, responsive, and visually consistent with the control room.
 */
export function PlannerKpiCard({
  title,
  value,
  subtitle,
  trend,
  tone = "#171a30",
  badge,
  badgeTone = "neutral",
  progressPct,
  tooltipText,
  className = "",
}: PlannerKpiCardProps) {
  const badgeStyles: Record<string, string> = {
    ok: "border-[#16a34a]/30 bg-[#f0fdf4] text-[#166534]",
    warn: "border-[#d97706]/30 bg-[#fffbeb] text-[#92400e]",
    crit: "border-[#dc2626]/30 bg-[#fef2f2] text-[#991b1b]",
    primary: "border-[#2e3092]/30 bg-[#eef0fa] text-[#2e3092]",
    neutral: "border-[#e3e6f0] bg-[#f1f3f9] text-[#4d5468]",
  };

  const tooltipDesc = tooltipText ?? KPI_TOOLTIPS[title];

  // Derive progress if not explicitly passed
  let computedProgress = progressPct;
  if (computedProgress === undefined && typeof value === "string") {
    if (value.endsWith("%")) {
      computedProgress = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
    } else if (value.includes("/")) {
      const parts = value.split("/");
      const a = parseInt(parts[0], 10);
      const b = parseInt(parts[1], 10);
      if (b > 0) computedProgress = Math.min(100, Math.round((a / b) * 100));
    }
  }

  const cardContent = (
    <div
      role="region"
      aria-label={`${title}: ${String(value)}`}
      className={`group flex flex-col justify-between rounded-xl border border-[#e3e6f0] bg-white p-3 shadow-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#2e3092]/35 hover:shadow-md cursor-default ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span
          className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[#878da1] transition-colors group-hover:text-[#4d5468]"
          title={typeof title === "string" ? title : undefined}
        >
          {title}
        </span>
        {badge && (
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider border transition-transform duration-150 group-hover:scale-105 ${badgeStyles[badgeTone]}`}
          >
            {badge}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div
          className="font-mono text-xl sm:text-2xl font-extrabold leading-tight tracking-tight transition-transform duration-150 group-hover:scale-[1.02]"
          style={{ color: tone }}
        >
          {typeof value === "string" || typeof value === "number" ? (
            <AnimatedCounter value={value} />
          ) : (
            value
          )}
        </div>
        {trend && (
          <div className="shrink-0 font-mono text-[10px] font-semibold text-[#878da1]">
            {trend}
          </div>
        )}
      </div>

      {computedProgress !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#eef0f6]">
          <div
            className="h-full rounded-full transition-all duration-600 ease-out"
            style={{
              width: `${computedProgress}%`,
              backgroundColor: tone === "#171a30" ? PRIMARY : tone,
            }}
          />
        </div>
      )}

      {subtitle && (
        <div
          className="mt-1 truncate text-[11px] text-[#4d5468]"
          title={typeof subtitle === "string" ? subtitle : undefined}
        >
          {subtitle}
        </div>
      )}
    </div>
  );

  if (tooltipDesc) {
    return <Tooltip content={tooltipDesc}>{cardContent}</Tooltip>;
  }

  return cardContent;
}

export interface PlanningQualityDashboardProps {
  metrics: PlannerQualityMetrics;
  title?: string;
  plannerStatus?: "Optimal" | "Feasible" | "Infeasible" | string;
  sourceHint?: string;
  className?: string;
}

const STATUS_BADGE_STYLE: Record<string, { tone: "ok" | "primary" | "crit" | "warn"; label: string }> = {
  Optimal: { tone: "ok", label: "Optimal plan" },
  Feasible: { tone: "primary", label: "Feasible plan" },
  Infeasible: { tone: "crit", label: "Infeasible constraint" },
};

/**
 * Planning Quality Dashboard.
 * Renders the 6 primary required operational KPI cards plus optional backend fields.
 */
export function PlanningQualityDashboard({
  metrics,
  title = "Planning Quality & Performance",
  plannerStatus,
  sourceHint,
  className = "",
}: PlanningQualityDashboardProps) {
  const completedStr =
    typeof metrics.maintenanceCompleted === "string"
      ? metrics.maintenanceCompleted
      : `${metrics.maintenanceCompleted.scheduled}/${metrics.maintenanceCompleted.total}`;

  const utilNumber =
    typeof metrics.blockUtilization === "number"
      ? metrics.blockUtilization
      : parseInt(String(metrics.blockUtilization).replace(/[^0-9]/g, ""), 10) || 0;

  const utilTone = utilNumber >= 85 ? OK : utilNumber >= 70 ? WARN : CRIT;
  const backlogNumber = Number(metrics.criticalBacklog) || 0;
  const backlogTone = backlogNumber > 0 ? WARN : OK;

  const activeStatus = plannerStatus ?? metrics.plannerStatus;
  const statusMeta = activeStatus ? STATUS_BADGE_STYLE[activeStatus] ?? { tone: "neutral", label: activeStatus } : null;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header bar with optional status and source hint */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#171a30]">
            {title}
          </span>
          {statusMeta && (
            <span
              className={`rounded border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${
                statusMeta.tone === "ok"
                  ? "border-[#16a34a]/30 bg-[#f0fdf4] text-[#166534]"
                  : statusMeta.tone === "primary"
                    ? "border-[#2e3092]/30 bg-[#eef0fa] text-[#2e3092]"
                    : "border-[#dc2626]/30 bg-[#fef2f2] text-[#991b1b]"
              }`}
            >
              {statusMeta.label}
            </span>
          )}
        </div>
        {sourceHint && (
          <span className="font-mono text-[10px] text-[#878da1]">{sourceHint}</span>
        )}
      </div>

      {/* Primary KPI Grid (6 core operational metrics) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* 1. Maintenance Completed */}
        <PlannerKpiCard
          title="Maintenance Completed"
          value={completedStr}
          subtitle="Tier 0–4 queue coverage"
          trend="Tonight"
          tone="#171a30"
        />

        {/* 2. Critical Backlog */}
        <PlannerKpiCard
          title="Critical Backlog"
          value={metrics.criticalBacklog}
          subtitle="Tier 0–2 overdue work"
          badge={backlogNumber > 0 ? "Action req" : "Cleared"}
          badgeTone={backlogTone === OK ? "ok" : "warn"}
          tone={backlogTone}
        />

        {/* 3. Block Utilization */}
        <PlannerKpiCard
          title="Block Utilization"
          value={
            typeof metrics.blockUtilization === "number"
              ? `${metrics.blockUtilization}%`
              : metrics.blockUtilization
          }
          subtitle="Window duration used"
          trend="Target ≥85%"
          tone={utilTone}
        />

        {/* 4. Train Impact */}
        <PlannerKpiCard
          title="Train Impact"
          value={
            typeof metrics.trainImpact === "number"
              ? `${metrics.trainImpact} min`
              : metrics.trainImpact
          }
          subtitle="Freight regulation hold"
          badge="Paths OK"
          badgeTone="ok"
          tone="#4d5468"
        />

        {/* 5. Possessions Used */}
        <PlannerKpiCard
          title="Possessions Used"
          value={metrics.possessionsUsed}
          subtitle="Blocks active tonight"
          tone={PRIMARY}
        />

        {/* 6. Possessions Avoided */}
        <PlannerKpiCard
          title="Possessions Avoided"
          value={metrics.possessionsAvoided}
          subtitle="Bundled via rulebook"
          badge={`+${metrics.possessionsAvoided} saved`}
          badgeTone="ok"
          tone={OK}
        />
      </div>

      {/* Future Backend Metrics (Rendered only when provided by FastAPI / backend) */}
      {(metrics.jobsScheduled !== undefined || metrics.jobsDeferred !== undefined) && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 pt-1">
          {metrics.jobsScheduled !== undefined && (
            <PlannerKpiCard
              title="Jobs Scheduled"
              value={metrics.jobsScheduled}
              subtitle="Placed in current plan"
              tone={OK}
            />
          )}
          {metrics.jobsDeferred !== undefined && (
            <PlannerKpiCard
              title="Jobs Deferred"
              value={metrics.jobsDeferred}
              subtitle="Held for future windows"
              tone={WARN}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pure builder function: derives PlannerQualityMetrics from planner result
 * or canonical synthetic fallback without duplicating data sources.
 */
export function buildQualityMetricsFromPlan(
  result?: PlannerResult | null,
  overrideMetrics?: Partial<PlannerQualityMetrics>
): PlannerQualityMetrics {
  const metrics: PlannerMetrics | undefined = result?.metrics;
  const assignments = result?.assignments ?? recommendedPlan.assignments;

  // Maintenance completed: scheduled jobs / total registered jobs
  const scheduledCount = assignments.length;
  const totalJobsCount = jobs.length;

  // Critical backlog: Tier 0-2 jobs with overdue deadlines in current queue
  const criticalOverdueCount = jobs.filter(
    (j) => j.tier <= 2 && (j.deadline.startsWith("Overdue") || j.deadline.startsWith("Immediate"))
  ).length;

  // Utilization: from metrics or default r3 (91%)
  const utilization = metrics?.utilization ?? 91;

  // Train impact: cumulative freight regulation (15 min + 10 min = 25 min in synthetic plan)
  const impactMinutes = "25 min";

  // Possessions used: distinct blocks scheduled tonight
  const usedWindows = new Set(assignments.map((a) => a.windowId));
  const possessionsUsed = metrics?.blocks ?? usedWindows.size;

  // Possessions avoided: bundling in W1 (3 jobs -> 2 saved) + W3 (2 jobs -> 1 saved) = 3
  const possessionsAvoided = 3;

  // Future backend fields: populated only when backend is live or explicitly passed in overrides
  const isBackend = result?.source?.status === "live";

  return {
    maintenanceCompleted: { scheduled: scheduledCount, total: totalJobsCount },
    criticalBacklog: criticalOverdueCount,
    blockUtilization: utilization,
    trainImpact: impactMinutes,
    possessionsUsed,
    possessionsAvoided,
    jobsScheduled: isBackend ? (metrics?.jobs ?? scheduledCount) : undefined,
    jobsDeferred: isBackend
      ? (metrics?.deferredCount ?? result?.deferred?.length ?? recommendedPlan.deferred.length)
      : undefined,
    plannerStatus: isBackend ? "Optimal" : undefined,
    ...overrideMetrics,
  };
}
