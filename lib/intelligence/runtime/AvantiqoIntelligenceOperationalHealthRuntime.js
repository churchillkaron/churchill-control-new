import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_CONTRACT =
  "AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_V1";

const USAGE_TABLE = "platform_service_usage";
const PROVIDER = "avantiqo-intelligence";
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_ROW_LIMIT = 5000;

function text(value, limit = 240) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function percentile(values, fraction) {
  const ordered = values
    .map(finite)
    .filter((value) => value !== null)
    .sort((left, right) => left - right);
  if (!ordered.length) return null;
  const index = Math.max(
    0,
    Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1),
  );
  return ordered[index];
}

function executionLane(row = {}) {
  const metadata = row?.metadata && typeof row.metadata === "object"
    ? row.metadata
    : {};
  const lane = text(metadata.intelligence_execution_lane, 20).toLowerCase();
  if (lane === "fast" || lane === "deep") return lane;
  return "unknown";
}

function status(row = {}) {
  return text(row.status, 40).toUpperCase() || "UNKNOWN";
}

function laneSummary(rows) {
  const terminal = rows.filter((row) => ["SUCCESS", "FAILED"].includes(status(row)));
  const succeeded = terminal.filter((row) => status(row) === "SUCCESS").length;
  const failed = terminal.filter((row) => status(row) === "FAILED").length;
  const pending = rows.filter((row) => status(row) === "PENDING").length;
  const providerLatencies = terminal
    .map((row) => finite(row.provider_latency_ms))
    .filter((value) => value !== null);
  const totalLatencies = terminal
    .map((row) => finite(row.latency_ms))
    .filter((value) => value !== null);
  return {
    request_count: rows.length,
    terminal_count: terminal.length,
    success_count: succeeded,
    failure_count: failed,
    pending_count: pending,
    success_rate: terminal.length ? succeeded / terminal.length : null,
    failure_rate: terminal.length ? failed / terminal.length : null,
    provider_latency_p50_ms: percentile(providerLatencies, 0.5),
    provider_latency_p95_ms: percentile(providerLatencies, 0.95),
    total_latency_p50_ms: percentile(totalLatencies, 0.5),
    total_latency_p95_ms: percentile(totalLatencies, 0.95),
  };
}

function oldestPendingAgeMs(rows, nowMs) {
  const pendingTimes = rows
    .filter((row) => status(row) === "PENDING")
    .map((row) => Date.parse(text(row.created_at, 120)))
    .filter(Number.isFinite);
  if (!pendingTimes.length) return 0;
  return Math.max(0, nowMs - Math.min(...pendingTimes));
}

function thresholds() {
  return {
    max_failure_rate: boundedNumber(
      process.env.AVANTIQO_INTELLIGENCE_SLO_MAX_FAILURE_RATE,
      0.05,
      0,
      1,
    ),
    max_fast_provider_p95_ms: boundedNumber(
      process.env.AVANTIQO_INTELLIGENCE_SLO_MAX_FAST_PROVIDER_P95_MS,
      30000,
      1000,
      600000,
    ),
    max_deep_provider_p95_ms: boundedNumber(
      process.env.AVANTIQO_INTELLIGENCE_SLO_MAX_DEEP_PROVIDER_P95_MS,
      120000,
      1000,
      900000,
    ),
    max_pending_age_ms: boundedNumber(
      process.env.AVANTIQO_INTELLIGENCE_SLO_MAX_PENDING_AGE_MS,
      120000,
      1000,
      3600000,
    ),
  };
}

function alertCandidates({ overall, fast, deep, pendingAgeMs, limits }) {
  const alerts = [];
  if (
    overall.failure_rate !== null &&
    overall.failure_rate > limits.max_failure_rate
  ) {
    alerts.push({
      code: "INTELLIGENCE_FAILURE_RATE_SLO_BREACH",
      severity: "HIGH",
      observed: overall.failure_rate,
      threshold: limits.max_failure_rate,
    });
  }
  if (
    fast.provider_latency_p95_ms !== null &&
    fast.provider_latency_p95_ms > limits.max_fast_provider_p95_ms
  ) {
    alerts.push({
      code: "INTELLIGENCE_FAST_PROVIDER_P95_SLO_BREACH",
      severity: "HIGH",
      observed_ms: fast.provider_latency_p95_ms,
      threshold_ms: limits.max_fast_provider_p95_ms,
    });
  }
  if (
    deep.provider_latency_p95_ms !== null &&
    deep.provider_latency_p95_ms > limits.max_deep_provider_p95_ms
  ) {
    alerts.push({
      code: "INTELLIGENCE_DEEP_PROVIDER_P95_SLO_BREACH",
      severity: "HIGH",
      observed_ms: deep.provider_latency_p95_ms,
      threshold_ms: limits.max_deep_provider_p95_ms,
    });
  }
  if (pendingAgeMs > limits.max_pending_age_ms) {
    alerts.push({
      code: "INTELLIGENCE_PENDING_AGE_SLO_BREACH",
      severity: "HIGH",
      observed_ms: pendingAgeMs,
      threshold_ms: limits.max_pending_age_ms,
    });
  }
  return alerts;
}

export async function getAvantiqoIntelligenceOperationalHealth({
  lookback_hours = DEFAULT_LOOKBACK_HOURS,
  limit = DEFAULT_ROW_LIMIT,
} = {}) {
  const hours = boundedNumber(lookback_hours, DEFAULT_LOOKBACK_HOURS, 1, 168);
  const rowLimit = Math.floor(boundedNumber(limit, DEFAULT_ROW_LIMIT, 100, 10000));
  const nowMs = Date.now();
  const since = new Date(nowMs - hours * 60 * 60 * 1000).toISOString();

  const result = await supabaseAdmin
    .from(USAGE_TABLE)
    .select("status,provider_model,provider_latency_ms,latency_ms,created_at,metadata")
    .eq("provider", PROVIDER)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(rowLimit);
  if (result.error) throw result.error;

  const rows = Array.isArray(result.data) ? result.data : [];
  const fastRows = rows.filter((row) => executionLane(row) === "fast");
  const deepRows = rows.filter((row) => executionLane(row) === "deep");
  const unknownRows = rows.filter((row) => executionLane(row) === "unknown");
  const overall = laneSummary(rows);
  const fast = laneSummary(fastRows);
  const deep = laneSummary(deepRows);
  const pendingAgeMs = oldestPendingAgeMs(rows, nowMs);
  const limits = thresholds();
  const alerts = alertCandidates({ overall, fast, deep, pendingAgeMs, limits });

  return {
    success: true,
    contract: AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_CONTRACT,
    provider: PROVIDER,
    lookback_hours: hours,
    observed_at: new Date(nowMs).toISOString(),
    overall,
    lanes: {
      fast,
      deep,
      unknown: laneSummary(unknownRows),
    },
    oldest_pending_age_ms: pendingAgeMs,
    thresholds: limits,
    alert_candidates: alerts,
    status: rows.length === 0
      ? "NO_USAGE_DATA"
      : alerts.length
        ? "SLO_ATTENTION_REQUIRED"
        : "HEALTHY",
    privacy: {
      aggregate_only: true,
      prompts_returned: false,
      transcripts_returned: false,
      raw_errors_returned: false,
      organization_ids_returned: false,
      customer_content_returned: false,
    },
    side_effects: {
      provider_call_performed: false,
      wallet_write_performed: false,
      runpod_job_submitted: false,
      training_started: false,
      model_weight_mutation: false,
    },
  };
}

export const AvantiqoIntelligenceOperationalHealthRuntime = Object.freeze({
  contract: AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_CONTRACT,
  get: getAvantiqoIntelligenceOperationalHealth,
});
