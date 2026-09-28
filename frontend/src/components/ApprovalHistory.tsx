// ---------------------------------------------------------------------------
// APPROVAL & HISTORY — Officer-Centric Authorization Interface
// Focused decision screen answering:
// 1. What has the system decided? (Proposed blocks + bundled jobs)
// 2. What maintenance work has been bundled into each proposed block?
// 3. Are there important issues I should know about? (Actionable exceptions)
// 4. Do I approve it, reject it, or want to reconsider something?
// ---------------------------------------------------------------------------

import { useState, useCallback, useEffect, useMemo } from "react";
import type { DecisionEntry } from "../data/planData";
import {
  PROPOSED_BLOCKS,
  ISSUES_TO_REVIEW,
  HUMAN_PLAN_HISTORY,
  type OfficerPlanStatus,
  type DraftChange,
} from "../lib/approvalData";
import { ApprovalHeader } from "./approval/ApprovalHeader";
import { CurrentPlanCard } from "./approval/CurrentPlanCard";
import { ProposedBlocks } from "./approval/ProposedBlocks";
import { IssuesToReview } from "./approval/IssuesToReview";
import { OfficerDecision } from "./approval/OfficerDecision";
import { ModifyPlanWorkflow } from "./approval/ModifyPlanWorkflow";
import { PlanHistoryAudit } from "./approval/PlanHistoryAudit";

import {
  getCurrentPlan,
  getAuditHistory,
  approvePlan,
  modifyPlan,
  rejectPlan,
  lockPlan,
} from "../api/approvals";
import type { AuditEntry, GovernedPlan } from "../api/types";
import { ApiError } from "../api/client";

export type PlanStatus = "Pending approval" | "Approved" | "Modified" | "Rejected" | "Locked";

interface ApprovalHistoryProps {
  status: PlanStatus;
  locked: boolean;
  decisions: DecisionEntry[];
  /** Set when a revised plan arrives from Simulation / the Assistant. */
  revisedNote?: string | null;
  onAction: (action: "Approved" | "Modified" | "Rejected", reason: string) => void;
  onToggleLock: () => void;
  onNavigate?: (view: "command" | "network" | "workspace" | "simulation" | "approval") => void;
  onSelectWindow?: (windowId: string) => void;
}

const PLAN_ID = "PLAN-r1";
const DEFAULT_OFFICER = "Dy. Chief Controller (BCT)";

export default function ApprovalHistory({
  status,
  locked,
  decisions,
  revisedNote,
  onAction,
  onToggleLock,
  onNavigate,
  onSelectWindow,
}: ApprovalHistoryProps) {
  // Mode state: VIEW vs MODIFY
  const [approvalMode, setApprovalMode] = useState<"VIEW" | "MODIFY">("VIEW");
  const [modifyTargetType, setModifyTargetType] = useState<"block" | "job" | "deferred" | "issue">("block");
  const [modifyTargetId, setModifyTargetId] = useState<string>("W1");

  // Backend governance integration
  const [, setGovernedPlan] = useState<GovernedPlan | null>(null);
  const [backendAudit, setBackendAudit] = useState<AuditEntry[]>([]);
  const [govBusy, setGovBusy] = useState(false);
  const [govError, setGovError] = useState<string | null>(null);

  const refreshGovernance = useCallback(async () => {
    try {
      const [plan, audit] = await Promise.all([getCurrentPlan(), getAuditHistory(PLAN_ID)]);
      setGovernedPlan(plan);
      setBackendAudit(audit);
    } catch {
      // Backend unreachable: component falls back smoothly to offline/local governance
    }
  }, []);

  useEffect(() => {
    void refreshGovernance();
  }, [refreshGovernance]);

  const runGovernanceAction = useCallback(
    async (
      action: "approve" | "modify" | "reject" | "lock",
      reason: string,
      affectedJobs: string[] = []
    ) => {
      setGovBusy(true);
      setGovError(null);
      try {
        const officer = DEFAULT_OFFICER;
        const args = [PLAN_ID, officer, reason] as const;
        if (action === "approve") await approvePlan(...args);
        else if (action === "modify")
          await modifyPlan(PLAN_ID, officer, reason, {}, affectedJobs);
        else if (action === "reject") await rejectPlan(...args);
        else await lockPlan(...args);
        await refreshGovernance();
      } catch (error) {
        setGovError(
          error instanceof ApiError
            ? `Governance record update failed (${error.code}). Local state recorded.`
            : "Governance service offline. Local state recorded."
        );
      } finally {
        setGovBusy(false);
      }
    },
    [refreshGovernance]
  );

  // Map incoming props status to OfficerPlanStatus
  const normalizedStatus: OfficerPlanStatus = useMemo(() => {
    if (locked) return "Locked";
    if (status === "Pending approval") return "Pending Approval";
    return status;
  }, [status, locked]);

  // Navigate to Planning Workspace
  const handleNavigateToWorkspace = (windowId?: string) => {
    if (windowId && onSelectWindow) {
      onSelectWindow(windowId);
    }
    if (onNavigate) {
      onNavigate("workspace");
    }
  };

  // Actions
  const handleApprove = () => {
    onAction("Approved", "Approved by authorizing officer as scheduled");
    void runGovernanceAction("approve", "Approved as recommended");
  };

  const handleReject = (reason: string, note?: string) => {
    const fullReason = note ? `${reason}: ${note}` : reason;
    onAction("Rejected", fullReason);
    void runGovernanceAction("reject", fullReason);
  };

  const handleStartModify = (type: "block" | "job" | "deferred" | "issue" = "block", id = "W1") => {
    setModifyTargetType(type);
    setModifyTargetId(id);
    setApprovalMode("MODIFY");
  };

  const handleSubmitDraft = (summary: string, changes: DraftChange[]) => {
    const affectedJobIds = changes
      .map((c) => (c.targetId.startsWith("J-") ? c.targetId : null))
      .filter((id): id is string => Boolean(id));

    onAction("Modified", summary);
    void runGovernanceAction("modify", summary, affectedJobIds);
    setApprovalMode("VIEW");
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-2">
      {/* 1. Page Header */}
      <ApprovalHeader
        status={normalizedStatus}
        locked={locked}
        onNavigateToWorkspace={() => handleNavigateToWorkspace("W1")}
        onToggleLock={() => {
          onToggleLock();
          if (!locked) {
            void runGovernanceAction("lock", "Decision locked for audit");
          }
        }}
        lockDisabled={govBusy}
      />

      {/* Backend error banner if any (subtle) */}
      {govError && (
        <div className="rounded-lg border border-[#fecaca] bg-[#fff5f5] px-3.5 py-2 text-xs font-semibold text-[#dc2626]">
          {govError}
        </div>
      )}

      {/* 2. Current Plan Header Card */}
      <CurrentPlanCard
        status={normalizedStatus}
        locked={locked}
        revisedNote={revisedNote}
        onNavigateToWorkspace={() => handleNavigateToWorkspace("W1")}
        blocksCount={3}
        jobsCount={7}
      />

      {/* MODIFY MODE vs NORMAL VIEW MODE */}
      {approvalMode === "MODIFY" ? (
        /* MODIFY MODE: Targeted Decision Support */
        <ModifyPlanWorkflow
          initialTargetType={modifyTargetType}
          initialTargetId={modifyTargetId}
          onCancel={() => setApprovalMode("VIEW")}
          onSubmitDraft={handleSubmitDraft}
        />
      ) : (
        /* NORMAL MODE: Approval & Review */
        <>
          {/* 3. Proposed Blocks & Bundled Jobs */}
          <ProposedBlocks
            blocks={PROPOSED_BLOCKS}
            onSelectBlock={(blockId) => handleStartModify("block", blockId)}
            onNavigateToWorkspaceForBlock={(blockId) => handleNavigateToWorkspace(blockId)}
          />

          {/* 4. Issues to Review */}
          <IssuesToReview
            issues={ISSUES_TO_REVIEW}
            onSelectIssue={(issue) => handleStartModify("issue", issue.jobId)}
          />

          {/* 5. Officer Decision */}
          <OfficerDecision
            status={normalizedStatus}
            locked={locked}
            onApprove={handleApprove}
            onStartModify={() => handleStartModify("block", "W1")}
            onReject={handleReject}
            onToggleLock={onToggleLock}
            scheduledJobsCount={7}
            authorizedBlocksCount={3}
            deferredJobsCount={4}
            busy={govBusy}
          />
        </>
      )}

      {/* 6. Plan History & Secondary Audit Trail */}
      <PlanHistoryAudit
        planHistory={HUMAN_PLAN_HISTORY}
        backendAudit={backendAudit}
        seedDecisions={decisions}
      />
    </div>
  );
}