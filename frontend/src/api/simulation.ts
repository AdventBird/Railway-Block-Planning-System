// ---------------------------------------------------------------------------
// SIMULATION SERVICE — replanning events through the real backend.
// ---------------------------------------------------------------------------
// The Simulation view stays BEFORE → EVENT → AFTER, but every AFTER is
// POST /api/replan (§33): moved jobs, newly deferred/scheduled jobs and
// metrics are computed from actual before/after plans, never scripted.
// ---------------------------------------------------------------------------

import { ENDPOINTS, apiGet, apiPost } from "./client";
import type {
  PlannerAssignment,
  PlannerMetrics,
  ReplanEvent,
  ReplanResult,
} from "./types";
import type { DeferredJob } from "./types";

/** Scenario metadata served by GET /api/scenarios. */
export interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  job_count: number;
  window_count: number;
  has_event: boolean;
}

export async function listScenarios(): Promise<ScenarioMeta[]> {
  const payload = await apiGet<{ scenarios: ScenarioMeta[] }>(ENDPOINTS.scenarios);
  return payload.scenarios ?? [];
}

export async function runScenario(scenarioId: string): Promise<Record<string, unknown>> {
  return apiPost<Record<string, unknown>>(ENDPOINTS.scenariosRun, { scenario_id: scenarioId });
}

/** Baseline comparison (identical inputs, factual metrics, no winner). */
export interface EvaluationResult {
  scenario_id: string;
  results: Record<
    string,
    {
      mode: string;
      status: string;
      assignments: PlannerAssignment[];
      deferred_jobs: DeferredJob[];
      metrics: PlannerMetrics;
      train_impacts: string[];
    }
  >;
}

export async function runEvaluation(
  scenarioId: string,
  modes: string[] = ["EARLIEST_AVAILABLE", "GREEDY_PRIORITY", "CP_SAT"]
): Promise<EvaluationResult> {
  return apiPost<EvaluationResult>(ENDPOINTS.evaluate, {
    scenario_id: scenarioId,
    modes,
  });
}

/**
 * One demo event — the frontend describes the intent, the backend decides
 * everything else. Payloads mirror the seeded world (canonical corridor ids).
 */
export function specialTrainEvent(train: {
  id: string;
  number?: string;
  corridorId: string;
  start: string;
  end: string;
}): ReplanEvent {
  return {
    type: "SPECIAL_TRAIN",
    payload: { train: { isProtected: true, ...train } },
  };
}

export function trainCancelledEvent(trainId: string): ReplanEvent {
  return { type: "TRAIN_CANCELLED", payload: { trainId } };
}

export function resourceFailureEvent(resource: string): ReplanEvent {
  return { type: "RESOURCE_FAILURE", payload: { resource } };
}

export function emergencyJobEvent(job: {
  id: string;
  title?: string;
  corridorId: string;
  durationMinutes: number;
  targetWindow?: string;
}): ReplanEvent {
  return {
    type: "EMERGENCY_JOB",
    payload: { job: { tier: 0, severity: "EMERGENCY", ...job }, target_window: job.targetWindow },
  };
}

export function windowReducedEvent(windowId: string, minutes: number, end?: string): ReplanEvent {
  return { type: "WINDOW_REDUCED", payload: { windowId, minutes, end } };
}

export function windowWithdrawnEvent(windowId: string): ReplanEvent {
  return { type: "WINDOW_WITHDRAWN", payload: { windowId } };
}

export function priorityChangeEvent(jobId: string, tier: number): ReplanEvent {
  return { type: "PRIORITY_CHANGE", payload: { jobId, tier } };
}

export function operationalRestrictionEvent(corridorId: string, forbidPowerIsolation: boolean): ReplanEvent {
  return {
    type: "OPERATIONAL_RESTRICTION",
    payload: { corridorId, forbidPowerIsolation },
  };
}

export type { ReplanResult };
