// ---------------------------------------------------------------------------
// APPROVAL & HISTORY (§16–17) — one screen.
// Top: current recommended plan + the officer decision (APPROVE / MODIFY /
// REJECT + lock). Bottom: recent decisions audit trail.
// The officer is the only authority — nothing here is automatic.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Chip, Drawer, PageHeader, Button, CRIT, NEUTRAL, OK, PRIMARY } from "./ui";
import { blockWindows, PLAN_DATE, PLAN_VERSION, PLAN_VERSION_NEXT } from "../data/opsData";
import { decisionAudit, recommendedPlan, type DecisionEntry } from "../data/planData";
import { jobById } from "../data/jobsData";
import { seedWindowOfBackendId, seedJobOfBackendId } from "../data/idMap";
import { planStats } from "../lib/plan";
import { UtilBar } from "./TimelineUtil";
import { getPlannerResult } from "../api/planner";
import type { AuditEntry, GovernedPlan, PlannerResult } from "../api/types";
import {
  getCurrentPlan,
  getAuditHistory,
  approvePlan,
  modifyPlan,
  rejectPlan,
  lockPlan,
} from "../api/approvals";
import { ApiError } from "../api/client";
import { PlanningQualityDashboard, buildQualityMetricsFromPlan } from "./PlannerKpiCard";

export type PlanStatus = "Pending approval" | "Approved" | "Modified" | "Rejected" | "Locked";

interface ApprovalHistoryProps {
  status: PlanStatus;
  locked: boolean;
  decisions: DecisionEntry[];
  /** Set when a revised plan arrives from Simulation / the Assistant. */
  revisedNote?: string | null;
  onAction: (action: "Approved" | "Modified" | "Rejected", reason: string) => void;
  onToggleLock: () => void;
}

const BANNER: Record<PlanStatus, { cls: string; text: string }> = {
  "Pending approval": {
    cls: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
    text: "Awaiting officer decision — the recommended plan is ready for review.",
  },
  Approved: {
    cls: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
    text: "APPROVED — blocks may be issued to stations and departments. Lock the decision to freeze it.",
  },
  Modified: {
    cls: "border-[#c7d2fe] bg-[#eef0fa] text-[#2e3092]",
    text: "MODIFIED — plan re-issued as r4. Review the new draft before approving.",
  },
  Rejected: {
    cls: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
    text: "REJECTED — sent back with your reasons. Departments notified (simulated).",
  },
  Locked: {
    cls: "border-[#e3e6f0] bg-[#f5f6fc] text-[#4d5468]",
    text: "LOCKED — decision frozen for audit until unlocked.",
  },
};

/* -------------------------------------------------------------------------- */
/* Backend governance (§36–38) — ONE plan id for the demo night. The plan      */
/* store id is `PLAN-{plan_version}`; run_plan stores PLAN-r1 when the         */
/* planner first runs. Officer actions are executed BY the backend and        */
/* recorded in its immutable audit trail — never by this component.           */
/* -------------------------------------------------------------------------- */
const PLAN_ID = "PLAN-r1";
const DEFAULT_OFFICER = "Dy. Chief Controller (BCT)";

const REJECT_PRESETS = [
  "W2 path encroaches the 12009 Shatabdi path",
  "Isolation certificate not produced",
  "No suitable window this week",
];

const MODIFY_PRESETS = [
  "Shift W2 start +30 min — clear delayed Shatabdi",
  "Shorten W3 by 45 min — freight pressure",
  "Defer J-07 to 16 Sep — isolation certified late",
];

const ACTION_TONE: Record<DecisionEntry["action"], { color: string; bg: string }> = {
  Approved: { color: OK, bg: "#f0fdf4" },
  Modified: { color: PRIMARY, bg: "#eef0fa" },
  Rejected: { color: CRIT, bg: "#fef2f2" },
  Locked: { color: NEUTRAL, bg: "#f1f3f9" },
};

function ActionChip({ action }: { action: DecisionEntry["action"] }) {
  const m = ACTION_TONE[action];
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.color}33` }}
    >
      {action}
    </span>
  );
}

/** MODIFY — small real edits: move a job to another window or defer it. */
function ModifyDrawer({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (summary: string) => void;
}) {
  const planned = recommendedPlan.assignments.filter((a) => a.windowId !== "E3");
  const [moves, setMoves] = useState<Record<string, string>>({});
  const changes = Object.entries(moves).filter(([, v]) => v !== "keep");
  return (
    <Drawer
      open
      onClose={onClose}
      title="Modify the recommended plan"
      subtitle="Move a job to another window, or defer it — a reason is required"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-[#878da1]">{changes.length} change{changes.length === 1 ? "" : "s"}</span>
          <Button
            disabled={changes.length === 0}
            onClick={() =>
              onApply(
                changes
                  .map(([jobId, v]) =>
                    v === "defer"
                      ? `${jobId} deferred`
                      : v === "W1"
                        ? `${jobId} moved to W1`
                        : `${jobId} moved to ${v}`
                  )
                  .join("; ")
              )
            }
          >
            Apply changes
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {planned.map((a) => {
          const j = jobById(a.jobId);
          return (
            <div key={a.jobId} className="rounded-lg border border-[#e3e6f0] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] font-bold text-[#171a30]">
                  <span className="font-mono text-[10px] text-[#878da1]">{a.jobId}</span> {j?.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[#878da1]">
                  {a.windowId} · {a.start}–{a.end}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Action</span>
                <select
                  value={moves[a.jobId] ?? "keep"}
                  onChange={(e) => setMoves((m) => ({ ...m, [a.jobId]: e.target.value }))}
                  className="focus-primary flex-1 rounded-md border border-[#e3e6f0] bg-white px-2 py-1 text-[11px] text-[#171a30]"
                >
                  <option value="keep">Keep in {a.windowId}</option>
                  {a.windowId !== "W1" && <option value="W1">Move to W1 (NDLS–GZB)</option>}
                  {a.windowId !== "W2" && <option value="W2">Move to W2 (TDL–CNB)</option>}
                  {a.windowId !== "W3" && <option value="W3">Move to W3 (PRYJ–DDU)</option>}
                  <option value="defer">Defer to 16 Sep</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">Common modifications</div>
        <div className="flex flex-wrap gap-1.5">
          {MODIFY_PRESETS.map((p) => (
            <Chip key={p} label={p} color={PRIMARY} bg="#eef0fa" />
          ))}
        </div>
      </div>
    </Drawer>
  );
}

function ApprovalHistory({ status, locked, decisions, revisedNote, onAction, onToggleLock }: ApprovalHistoryProps) {
  const [modifyOpen, setModifyOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [auditId, setAuditId] = useState<string | null>(null);

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

  const qualityMetrics = useMemo(() => {
    return buildQualityMetricsFromPlan(plannerResult);
  }, [plannerResult]);

  /* ---------------- backend governance state (§36–38) ------------------- */
  const [governedPlan, setGovernedPlan] = useState<GovernedPlan | null>(null);
  const [backendAudit, setBackendAudit] = useState<AuditEntry[]>([]);
  const [govBusy, setGovBusy] = useState(false);
  const [govError, setGovError] = useState<string | null>(null);
  const [govNote, setGovNote] = useState<string | null>(null);

  const refreshGovernance = useCallback(async () => {
    // Both loaders resolve null/[] when the backend is unreachable — the UI
    // then falls back to the seeded demo history and says so.
    const [plan, audit] = await Promise.all([getCurrentPlan(), getAuditHistory(PLAN_ID)]);
    setGovernedPlan(plan);
    setBackendAudit(audit);
  }, []);

  useEffect(() => {
    void refreshGovernance();
  }, [refreshGovernance]);

  const backendStatus = governedPlan?.status;

  const runGovernanceAction = useCallback(
    async (
      action: "approve" | "modify" | "reject" | "lock",
      reason: string,
      affectedJobs: string[] = []
    ) => {
      setGovBusy(true);
      setGovError(null);
      setGovNote(null);
      try {
        const officer = DEFAULT_OFFICER;
        const args = [PLAN_ID, officer, reason] as const;
        if (action === "approve") await approvePlan(...args);
        else if (action === "modify")
          await modifyPlan(PLAN_ID, officer, reason, {}, affectedJobs);
        else if (action === "reject") await rejectPlan(...args);
        else await lockPlan(...args);
        setGovNote(`Recorded in the backend audit trail — ${reason || action.toUpperCase()}.`);
        await refreshGovernance();
      } catch (error) {
        setGovError(
          error instanceof ApiError
            ? `Governance action failed (${error.code}) — the local decision above is not recorded in the backend audit trail.`
            : "Governance action failed — backend unreachable; only the local decision above was recorded."
        );
      } finally {
        setGovBusy(false);
      }
    },
    [refreshGovernance]
  );

  // Summary metrics follow the LIVE plan when the backend has served one —
  // the officer must approve what the quality dashboard is showing (§6).
  const summaryAssignments = useMemo(
    () =>
      (plannerResult?.assignments ?? recommendedPlan.assignments).map((a) => ({
        ...a,
        windowId: seedWindowOfBackendId(a.windowId) ?? a.windowId,
      })),
    [plannerResult]
  );
  // Decision-summary metrics: the BACKEND owns interval/window arithmetic
  // (PART 6 — no frontend re-computation that can contradict the planner).
  // planStats only serves as the offline/fallback renderer.
  const stats = useMemo(() => {
    const m = plannerResult?.source.status === "live" ? plannerResult.metrics : null;
    if (m && (m.utilization !== undefined || m.blocks !== undefined)) {
      return {
        blocks: m.blocks ?? summaryAssignments.length,
        jobs: m.scheduled ?? summaryAssignments.length,
        utilization: m.utilization ?? 0,
        windowMinutes: m.windowMinutes ?? 0,
        occupiedMinutes: m.occupiedMinutes ?? 0,
        unusedMinutes: m.unusedMinutes ?? 0,
      };
    }
    return planStats(blockWindows.map((w) => ({ id: w.id, minutes: w.minutes })), summaryAssignments);
  }, [plannerResult, summaryAssignments]);
  const summaryImpacts = plannerResult?.trainImpact?.length ?? recommendedPlan.trainImpact.length;
  const summaryDeferred = plannerResult?.deferred?.length ?? recommendedPlan.deferred.length;

  /** Issues to review — derived from the actual plan, never hard-coded. */
  const issues = useMemo(() => {
    const rows = plannerResult?.deferred ?? [];
    const safety = rows.filter(
      (d) => (jobById(seedJobOfBackendId(d.jobId) ?? d.jobId)?.tier ?? 9) <= 1
    ).length;
    const resource = rows.filter((d) => d.code === "RESOURCE_CONFLICT").length;
    return [
      { n: Number(qualityMetrics.criticalBacklog) || 0, label: "critical backlog" },
      { n: safety, label: "deferred safety jobs" },
      { n: resource, label: "resource conflicts" },
    ].filter((i) => i.n > 0);
  }, [plannerResult, qualityMetrics.criticalBacklog]);

  const version = status === "Modified" || revisedNote ? PLAN_VERSION_NEXT : PLAN_VERSION;
  const needsReason = rejecting && reason.trim().length < 8;
  const audit = auditId ? decisions.find((d) => d.id === auditId) ?? null : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Page header — decision context + lock control */}
      <div className="order-1">
        <PageHeader
          title="Approval & History"
          subtitle="The officer is the only step that authorizes a block"
          meta="Approve · Modify · Reject — every decision is versioned and auditable"
          right={
          <button
            onClick={() => {
              if (!locked) {
                // Lock is a governance transition — the backend freezes it too.
                onToggleLock();
                void runGovernanceAction("lock", "Decision locked for audit");
              } else {
                // No backend unlock transition exists — be explicit about it.
                onToggleLock();
                setGovNote("Unlock is local to this demo — the backend plan store stays LOCKED until a new plan version is issued.");
              }
            }}
            disabled={status === "Pending approval" || govBusy}
            className="focus-primary rounded-lg border border-[#d9ddef] bg-white px-3 py-1.5 text-[11px] font-bold text-[#4d5468] transition-colors duration-200 hover:bg-[#f5f6fc] disabled:opacity-50"
          >
            {locked ? "Unlock decision" : "Lock decision"}
          </button>
          }
        />
      </div>

      {/* Status banner */}
      <div className={`order-2 rounded-xl border px-4 py-2.5 text-xs font-semibold ${BANNER[status].cls}`}>
        {BANNER[status].text}
        {revisedNote && status === "Pending approval" && (
          <span className="mt-1 block text-[11px] font-medium text-[#b45309]">Revised plan: {revisedNote}</span>
        )}
      </div>

      {/* Backend governance strip (§36) — demoted L3 context, below the decision */}
      <Card className="order-7 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#878da1]">
              Backend plan store
            </span>
            <span className="rounded bg-[#f1f3f9] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#4d5468]">
              {PLAN_ID}
            </span>
            {backendStatus ? (
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold uppercase ${
                  backendStatus === "LOCKED"
                    ? "bg-[#f1f3f9] text-[#4d5468]"
                    : backendStatus === "APPROVED" || backendStatus === "MODIFIED"
                      ? "bg-[#f0fdf4] text-[#166534]"
                      : backendStatus === "REJECTED"
                        ? "bg-[#fef2f2] text-[#991b1b]"
                        : "bg-[#eef0fa] text-[#2e3092]"
                }`}
              >
                {backendStatus}
              </span>
            ) : (
              <span className="text-[10px] italic text-[#878da1]">
                unreachable — run the planner once (Planning → Generate Plan) to create {PLAN_ID}
              </span>
          )}
          </div>
          <button
            onClick={() => void refreshGovernance()}
            disabled={govBusy}
            className="focus-primary rounded border border-[#e3e6f0] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4d5468] transition-colors duration-200 hover:bg-[#f5f6fc] disabled:opacity-50"
          >
            {govBusy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {govNote && <div className="mt-2 text-[11px] text-[#166534]">✓ {govNote}</div>}
        {govError && (
          <div className="mt-2 text-[11px] font-semibold text-[#dc2626]">{govError}</div>
        )}
      </Card>

      {/* Decision summary — what is being approved (Level 1) */}
      <Card className="order-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3.5">
        <span className="text-sm font-extrabold uppercase tracking-wider text-[#171a30]">
          Plan <span className="text-[#2e3092]">{version.split("·")[1]?.trim() ?? "r3"}</span>
        </span>
        <span>
          <span className="font-mono text-lg font-extrabold text-[#171a30]">{stats.blocks}</span>{" "}
          <span className="text-[10px] uppercase tracking-wider text-[#878da1]">blocks</span>
        </span>
        <span>
          <span className="font-mono text-lg font-extrabold text-[#171a30]">{stats.jobs}</span>{" "}
          <span className="text-[10px] uppercase tracking-wider text-[#878da1]">jobs</span>
        </span>
        <span className="min-w-[140px] flex-1">
          <UtilBar pct={stats.utilization} tone={PRIMARY} />
        </span>
        <span>
          <span className="font-mono text-lg font-extrabold text-[#171a30]">{summaryImpacts}</span>{" "}
          <span className="text-[10px] uppercase tracking-wider text-[#878da1]">train impacts</span>
        </span>
        <span>
          <span
            className="font-mono text-lg font-extrabold"
            style={{ color: Number(qualityMetrics.criticalBacklog) > 0 ? "#dc2626" : "#16a34a" }}
          >
            {qualityMetrics.criticalBacklog}
          </span>{" "}
          <span className="text-[10px] uppercase tracking-wider text-[#878da1]">critical backlog</span>
        </span>
        <span>
          <span className="font-mono text-lg font-extrabold text-[#171a30]">{summaryDeferred}</span>{" "}
          <span className="text-[10px] uppercase tracking-wider text-[#878da1]">deferred</span>
        </span>
        <span className="ml-auto font-mono text-[10px] text-[#878da1]">{PLAN_DATE}</span>
      </Card>

      {/* What will this plan do? — the operational consequence of approval */}
      <div className="order-5">
        <PlanningQualityDashboard
          metrics={qualityMetrics}
          title="What will this plan do?"
          plannerStatus={qualityMetrics.plannerStatus ?? "Optimal"}
          sourceHint={
            plannerResult?.source.status === "live"
              ? "Demo data · CP-SAT planner · synthetic railway scenario"
              : "Demo data · seeded baseline · synthetic railway scenario"
          }
        />
      </div>

      {/* Issues to review — derived signals the officer should not miss */}
      <Card className="order-6 px-4 py-3">
        <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#878da1]">
          Issues to review
        </div>
        {issues.length > 0 ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {issues.map((i) => (
              <span key={i.label} className="inline-flex items-baseline gap-1.5 text-[12px] text-[#4d5468]">
                <span
                  className="font-mono text-[17px] font-extrabold"
                  style={{ color: i.label === "critical backlog" ? "#dc2626" : "#d97706" }}
                >
                  {i.n}
                </span>
                <span className="font-semibold">{i.label}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[12px] font-semibold text-[#16a34a]">No open issues detected in this plan.</div>
        )}
      </Card>

      {/* Officer decision (Level 1) — the human is the final authority */}
      <Card className={`order-4 p-4 ${locked ? "opacity-90" : "border-[#2e3092]/50"}`}>
        {!rejecting ? (
          <>
            <div className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#878da1]">
              Officer decision{locked ? " · locked" : ""}
            </div>
            <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2">
              <Button
                onClick={() => {
                  onAction("Approved", "");
                  void runGovernanceAction("approve", "Approved as recommended");
                }}
                disabled={locked || govBusy}
                className="py-2.5 text-[13px]"
              >
                Approve plan
              </Button>
              <Button variant="secondary" onClick={() => setModifyOpen(true)} disabled={locked || govBusy}>
                Modify plan
              </Button>
              <Button variant="danger" onClick={() => setRejecting(true)} disabled={locked || govBusy}>
                Reject plan
              </Button>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-[#878da1]">
              Approve issues the blocks as recommended. Modify lets you move or defer individual jobs. Reject sends the
              plan back with a reason.
            </p>
          </>
        ) : (
          <RejectForm
            reason={reason}
            setReason={setReason}
            onCancel={() => setRejecting(false)}
            onConfirm={() => {
              onAction("Rejected", reason.trim());
              void runGovernanceAction("reject", reason.trim());
            }}
            disabled={needsReason || govBusy}
          />
        )}
      </Card>

      {/* Plan history — officer decisions & versions */}
      <h3 className="order-8 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#878da1]">Plan history — decisions &amp; versions</h3>
      <Card className="order-8 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[11px]">
          <thead>
            <tr className="border-b border-[#eef0f6] text-[10px] uppercase tracking-wider text-[#878da1]">
              <th className="px-4 py-2.5">Timestamp</th>
              <th className="px-4 py-2.5">Plan</th>
              <th className="px-4 py-2.5">Recommendation</th>
              <th className="px-4 py-2.5">Officer action</th>
              <th className="px-4 py-2.5">Reason</th>
              <th className="px-4 py-2.5">Officer</th>
            </tr>
          </thead>
          <tbody>
            {[...decisions].reverse().map((d) => (
              <tr
                key={d.id}
                onClick={() => setAuditId(d.id)}
                className="cursor-pointer border-b border-[#eef0f6] transition-colors duration-200 last:border-0 hover:bg-[#f5f6fc]"
              >
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[#4d5468]">{d.ts}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[#4d5468]">{d.version}</td>
                <td className="max-w-[240px] truncate px-4 py-2.5 text-[#171a30]">{d.recommendation}</td>
                <td className="px-4 py-2.5">
                  <ActionChip action={d.action} />
                </td>
                <td className="max-w-[220px] truncate px-4 py-2.5 text-[#4d5468]">
                  {decisionAudit[d.id]?.reasonShort ?? d.overrideReason ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-[#4d5468]">{d.officer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Backend audit trail (§38) — immutable, backend-owned reason codes */}
      {backendAudit.length > 0 && (
        <>
          <h3 className="order-9 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#878da1]">
            Audit trail — backend record{" "}
            <span className="font-mono font-normal normal-case tracking-normal text-[#a2a7ba]">{PLAN_ID}</span>
          </h3>
          <Card className="order-9 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[11px]">
              <thead>
                <tr className="border-b border-[#eef0f6] text-[10px] uppercase tracking-wider text-[#878da1]">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Timestamp (UTC)</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Officer</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5">Jobs affected</th>
                </tr>
              </thead>
              <tbody>
                {[...backendAudit].reverse().map((entry) => (
                  <tr key={entry.entry_id} className="border-b border-[#eef0f6] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[#878da1]">{entry.entry_id}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[#4d5468]">
                      {entry.timestamp.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-4 py-2.5 font-bold uppercase text-[#2e3092]">{entry.action}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[#4d5468]">{entry.officer}</td>
                    <td className="max-w-[260px] px-4 py-2.5 text-[#4d5468]">{entry.reason || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-[#878da1]">
                      {entry.affected_jobs.length ? entry.affected_jobs.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {modifyOpen && (
        <ModifyDrawer
          onClose={() => setModifyOpen(false)}
          onApply={(summary) => {
            setModifyOpen(false);
            onAction("Modified", summary);
            // Affected ids: the tokens in the summary that look like J-##.
            const affected = (summary.match(/J-\d+/g) ?? []).filter(
              (id, i, arr) => arr.indexOf(id) === i
            );
            void runGovernanceAction("modify", summary, affected);
          }}
        />
      )}

      {audit && <AuditDrawer entry={audit} onClose={() => setAuditId(null)} />}
    </div>
  );
}

/** Full audit record drawer — original vs revised, reason, affected jobs. */
function AuditDrawer({ entry, onClose }: { entry: DecisionEntry; onClose: () => void }) {
  const a = decisionAudit[entry.id];
  const rows: [string, string][] = a
    ? [
        ["Original plan", a.original],
        ["Revised plan", a.revised],
        ["Jobs affected", a.jobsAffected],
        ["Blocks affected", a.blocksAffected],
        ["Reason", a.reasonShort],
        ["Related", a.related],
      ]
    : [
        ["Recommendation", entry.recommendation],
        ["Officer reason", entry.overrideReason ?? "—"],
      ];
  return (
    <Drawer open onClose={onClose} title={`Decision ${entry.id}`} subtitle={`${entry.version} · ${entry.ts}`}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <ActionChip action={entry.action} />
        <Chip label={entry.officer} color={NEUTRAL} bg="#f1f3f9" />
      </div>
      <div className="rounded-lg border border-[#e3e6f0] px-3 py-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-3 border-b border-[#eef0f6] py-2 last:border-0">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[#878da1]">{k}</span>
            <span className="text-right text-[11px] leading-relaxed text-[#171a30]">{v}</span>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

/** Inline reject form — reason required before confirming. */
function RejectForm({
  reason,
  setReason,
  onCancel,
  onConfirm,
  disabled,
}: {
  reason: string;
  setReason: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#dc2626]">Reject — reason required</div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Why is this plan rejected?"
        className="focus-primary w-full rounded-lg border border-[#e3e6f0] bg-white px-3 py-2 text-[12px] text-[#171a30] placeholder:text-[#a2a7ba]"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {REJECT_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setReason(p)}
            className="focus-primary rounded border border-[#e3e6f0] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4d5468] transition-colors duration-200 hover:bg-[#f5f6fc]"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="danger" disabled={disabled} onClick={onConfirm}>
          Confirm rejection
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </>
  );
}

export default ApprovalHistory;