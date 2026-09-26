// ---------------------------------------------------------------------------
// CANONICAL API CLIENT — the only module allowed to call fetch().
// ---------------------------------------------------------------------------
// One transport for the whole frontend (§34): base URL configuration,
// timeout, envelope unwrapping and typed failures. No component ever builds
// a URL or parses a response itself.
//
// Backend contract: every endpoint answers the canonical envelope
//   { status, generated_at, payload, data_quality, errors }
// ---------------------------------------------------------------------------

const ENV_BASE_URL: string =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env === "object" &&
  typeof (import.meta.env as Record<string, unknown>).VITE_API_BASE_URL === "string"
    ? ((import.meta.env as Record<string, unknown>).VITE_API_BASE_URL as string)
    : "";

const REQUEST_TIMEOUT_MS = 15000;

/** Canonical endpoints (frontend never builds URLs elsewhere). */
export const ENDPOINTS = {
  health: "/api/health",
  jobs: "/api/jobs",
  trains: "/api/trains",
  blocks: "/api/blocks",
  network: "/api/network",
  plannerRun: "/api/planner/run",
  replan: "/api/replan",
  scenarios: "/api/scenarios",
  scenariosRun: "/api/scenarios/run",
  evaluate: "/api/evaluate",
  blockClearance: "/api/block-clearance/check",
  plan: (planId: string): string => `/api/plans/${encodeURIComponent(planId)}`,
  planAudit: (planId: string): string => `/api/plans/${encodeURIComponent(planId)}/audit`,
  planAction: (planId: string, action: "approve" | "modify" | "reject" | "lock"): string =>
    `/api/plans/${encodeURIComponent(planId)}/${action}`,
  reasonCodes: "/api/reason-codes/planning",
} as const;

let baseUrlCache: string | null = null;

/** Resolve the configured backend base URL (empty string ⇒ not configured). */
export function apiBaseUrl(): string {
  const configured = baseUrlCache ?? ENV_BASE_URL;
  // Demo default: the primary FastAPI server on :8000.
  return (configured || "http://127.0.0.1:8000").trim().replace(/\/+$/, "");
}

/** Runtime override — lets tests or a dev console inject a backend host. */
export function setApiBaseUrl(baseUrl: string | null): void {
  baseUrlCache = baseUrl ?? "";
}

/** True once a backend base URL is configured (always true in the demo). */
export function isBackendConfigured(): boolean {
  return apiBaseUrl().length > 0;
}

/* -------------------------------------------------------------------------- */
/* Canonical envelope                                                         */
/* -------------------------------------------------------------------------- */

export interface ApiEnvelope<T = Record<string, unknown>> {
  status: string;
  generated_at: string;
  payload: T;
  data_quality?: Record<string, number> | null;
  errors?: { code: string; message: string; severity?: string }[];
}

export class ApiError extends Error {
  readonly code: string;
  readonly endpoint: string;

  constructor(code: string, message: string, endpoint: string) {
    super(message);
    this.code = code;
    this.endpoint = endpoint;
  }
}

/** One warning per endpoint per session — a dead backend never spams. */
const warnedEndpoints = new Set<string>();

function warnOnce(endpoint: string, reason: string): void {
  if (warnedEndpoints.has(endpoint)) return;
  warnedEndpoints.add(endpoint);
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(`[api] ${endpoint} unavailable (${reason}).`);
  }
}

/** POST with JSON body; returns the unwrapped payload or throws ApiError. */
export async function apiPost<T = Record<string, unknown>>(
  endpoint: string,
  body: unknown = {}
): Promise<T> {
  return request<T>(endpoint, "POST", body);
}

/** GET; returns the unwrapped payload or throws ApiError. */
export async function apiGet<T = Record<string, unknown>>(endpoint: string): Promise<T> {
  return request<T>(endpoint, "GET");
}

async function request<T>(endpoint: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const base = apiBaseUrl();
  if (!base || typeof fetch !== "function") {
    throw new ApiError("BACKEND_UNCONFIGURED", "No backend base URL configured.", endpoint);
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;

  try {
    const response = await fetch(`${base}${endpoint}`, {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: controller ? controller.signal : undefined,
    });
    if (!response || !response.ok) {
      const reason = response ? `HTTP ${response.status}` : "no response";
      warnOnce(endpoint, reason);
      throw new ApiError("HTTP_ERROR", `${endpoint} failed (${reason}).`, endpoint);
    }
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (envelope && typeof envelope === "object" && "payload" in envelope) {
      if (envelope.status === "ERROR" && envelope.errors?.length) {
        throw new ApiError(
          envelope.errors[0].code ?? "BACKEND_ERROR",
          envelope.errors[0].message ?? "Backend reported an error.",
          endpoint
        );
      }
      return envelope.payload;
    }
    // Tolerate non-envelope JSON (defensive).
    return envelope as unknown as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const reason = error instanceof Error ? error.name : "network error";
    warnOnce(endpoint, reason);
    throw new ApiError("NETWORK_ERROR", `${endpoint} unreachable (${reason}).`, endpoint);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** True when the backend answers /api/health. */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    await apiGet(ENDPOINTS.health);
    return true;
  } catch {
    return false;
  }
}
