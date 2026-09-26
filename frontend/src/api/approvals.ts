// ---------------------------------------------------------------------------
// APPROVALS SERVICE — governance through the backend plan store (§36–38).
// ---------------------------------------------------------------------------
// Every action (APPROVE / MODIFY / REJECT / LOCK) is executed by the backend,
// which records officer, timestamp, plan version, reason and affected jobs in
// its immutable audit trail. The frontend never mutates plan state itself.
// ---------------------------------------------------------------------------

import { ENDPOINTS, apiGet, apiPost } from "./client";
import type { AuditEntry, GovernedPlan, GovernanceStatus } from "./types";

export interface GovernanceActionResult extends GovernedPlan {
  audit_entry?: AuditEntry;
}

/** Most recent governed plan (single-plan demo convenience). */
export async function getCurrentPlan(): Promise<GovernedPlan | null> {
  try {
    return await apiGet<GovernedPlan>(ENDPOINTS.plan("PLAN-r1"));
  } catch {
    return null;
  }
}

export async function getPlan(planId: string): Promise<GovernedPlan | null> {
  try {
    return await apiGet<GovernedPlan>(ENDPOINTS.plan(planId));
  } catch {
    return null;
  }
}

export async function getAuditHistory(planId = "PLAN-r1"): Promise<AuditEntry[]> {
  try {
    const payload = await apiGet<{ audit: AuditEntry[] }>(ENDPOINTS.planAudit(planId));
    return payload.audit ?? [];
  } catch {
    return [];
  }
}

async function act(
  planId: string,
  action: "approve" | "modify" | "reject" | "lock",
  officer: string,
  reason: string,
  affectedJobs: string[] = [],
  modifiedPlan?: Record<string, unknown>
): Promise<GovernanceActionResult> {
  return apiPost<GovernanceActionResult>(ENDPOINTS.planAction(planId, action), {
    action: action.toUpperCase(),
    officer,
    reason,
    affected_jobs: affectedJobs,
    modified_plan: modifiedPlan,
  });
}

export function approvePlan(planId: string, officer: string, reason = ""): Promise<GovernanceActionResult> {
  return act(planId, "approve", officer, reason);
}

export function modifyPlan(
  planId: string,
  officer: string,
  reason: string,
  modifiedPlan: Record<string, unknown>,
  affectedJobs: string[] = []
): Promise<GovernanceActionResult> {
  return act(planId, "modify", officer, reason, affectedJobs, modifiedPlan);
}

export function rejectPlan(planId: string, officer: string, reason: string): Promise<GovernanceActionResult> {
  return act(planId, "reject", officer, reason);
}

export function lockPlan(planId: string, officer: string, reason = ""): Promise<GovernanceActionResult> {
  return act(planId, "lock", officer, reason);
}

export type { GovernanceStatus };
