export const CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT = "AVANTIQO_CODE_AI_CERTIFICATION_RESILIENCE_V1";
export const RUNPOD_HEALTH_MAX_ATTEMPTS = 4;
export const SUPABASE_NETWORK_MAX_ATTEMPTS = 4;
export const CHILD_TERMINATION_GRACE_MS = 4000;
export const CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS = 8 * 60_000;
export const CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT = 1;
export const CODE_AI_PLANNER_STALE_CANCEL_SETTLE_WINDOW_MS = 45_000;

const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_NETWORK_MARKERS = [
  "fetch failed",
  "epipe",
  "econnreset",
  "econnrefused",
  "etimedout",
  "eai_again",
  "und_err_connect_timeout",
  "und_err_socket",
  "socket hang up",
];

function text(value) {
  return String(value ?? "").trim();
}

export function isRetryableHttpStatus(status) {
  return RETRYABLE_HTTP_STATUS.has(Number(status));
}

export function isTransientNetworkError(error) {
  const message = text(error?.message || error).toLowerCase();
  const cause = text(error?.cause?.message || error?.cause).toLowerCase();
  const code = text(error?.code || error?.cause?.code).toLowerCase();
  const combined = `${message} ${cause} ${code}`;
  return TRANSIENT_NETWORK_MARKERS.some((marker) => combined.includes(marker));
}

export function boundedRetryDelayMs(attempt) {
  const index = Math.max(0, Number(attempt) || 0);
  return Math.min(250 * (2 ** index), 2000);
}

export function isRunpodHealthRequest(input, init = {}) {
  let url;
  try {
    url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);
  } catch {
    return false;
  }
  const method = text(init?.method || input?.method || "GET").toUpperCase();
  return method === "GET" && url.hostname === "api.runpod.ai" && url.pathname.endsWith("/health");
}

export function isSupabaseCleanupRetryRequest(input, init = {}, supabaseOrigin = "") {
  let url;
  let expectedOrigin;
  try {
    url = new URL(typeof input === "string" || input instanceof URL ? input : input?.url);
    expectedOrigin = new URL(supabaseOrigin).origin;
  } catch {
    return false;
  }
  const method = text(init?.method || input?.method || "GET").toUpperCase();
  return url.origin === expectedOrigin && ["GET", "HEAD", "PATCH"].includes(method);
}


const CODE_PLANNER_QUEUED_STATUSES = new Set(["queued", "in_queue", "pending", "submitted"]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function codePlannerPendingAgeMs(startedAt, nowMs = Date.now()) {
  const started = Date.parse(text(startedAt));
  const now = finite(nowMs, Date.now());
  return Number.isFinite(started) ? Math.max(0, now - started) : 0;
}

export function staleCodePlannerQueueRecoveryExhausted({
  provider = "",
  providerStatus = "",
  startedAt = null,
  nowMs = Date.now(),
  recoveryCount = 0,
} = {}) {
  return (
    text(provider).toLowerCase() === "avantiqo-code" &&
    CODE_PLANNER_QUEUED_STATUSES.has(text(providerStatus).toLowerCase()) &&
    codePlannerPendingAgeMs(startedAt, nowMs) >= CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS &&
    finite(recoveryCount, 0) >= CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT
  );
}

export function shouldRecoverStaleQueuedPlannerJob({
  provider = "",
  providerStatus = "",
  startedAt = null,
  nowMs = Date.now(),
  recoveryCount = 0,
  health = null,
} = {}) {
  if (text(provider).toLowerCase() !== "avantiqo-code") return false;
  if (!CODE_PLANNER_QUEUED_STATUSES.has(text(providerStatus).toLowerCase())) return false;
  if (codePlannerPendingAgeMs(startedAt, nowMs) < CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS) return false;
  if (finite(recoveryCount, 0) >= CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT) return false;
  if (!health || typeof health !== "object") return false;
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  if (finite(jobs.in_progress ?? jobs.inProgress, 0) > 0) return false;
  if (finite(workers.initializing, 0) > 0) return false;
  return true;
}
