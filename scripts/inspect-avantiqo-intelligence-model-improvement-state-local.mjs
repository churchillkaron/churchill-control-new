import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_INTELLIGENCE_MODEL_IMPROVEMENT_STATE_INSPECT_V1";
const ENV_PATH = ".env.local";
const MEMORY_TABLE = "intelligence_memories";
const CANONICAL_ORGANIZATION_NAME = "Avantiqo Platform";
const CANONICAL_ORGANIZATION_TYPE = "enterprise_group";
const SCOPES = Object.freeze({
  training_jobs: "platform_model_training_jobs",
  benchmark_suites: "platform_model_benchmark_suites",
  benchmark_runs: "platform_model_benchmark_runs",
  model_candidates: "platform_model_candidates",
  promotion_reviews: "platform_model_promotion_reviews",
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}

async function parseEnv() {
  const source = await readFile(ENV_PATH, "utf8");
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

function supabaseTarget(rawUrl) {
  const raw = text(rawUrl, 1200);
  if (!raw) throw new Error("NEXT_PUBLIC_SUPABASE_URL_REQUIRED");
  const url = new URL(raw);
  const host = text(url.hostname, 400);
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  return {
    base_url: raw.replace(/\/+$/, ""),
    kind: local ? "LOCAL" : "CLOUD_OR_REMOTE",
    host,
    project_ref: !local && host.endsWith(".supabase.co")
      ? host.slice(0, -".supabase.co".length)
      : null,
  };
}

async function requestJson(target, key, path, search = {}) {
  const url = new URL(`${target.base_url}/rest/v1/${path}`);
  for (const [name, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(name, String(entry));
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(name, String(value));
    }
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.details || body?.hint || raw, 800);
    throw new Error(`SUPABASE_READ_ONLY_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return Array.isArray(body) ? body : [];
}

function safeMetadata(row) {
  const metadata = object(row?.metadata);
  const trainingMetrics = object(metadata.training_metrics);
  const comparison = object(metadata.comparison);
  const canary = object(metadata.canary);
  const certification = object(canary.certification);
  return {
    id: text(row?.id, 200) || null,
    subject: text(row?.subject, 300) || null,
    status: text(metadata.status, 120) || null,
    contract: text(metadata.contract, 200) || null,
    updated_at: row?.updated_at || null,
    training_job_id: text(metadata.training_job_id, 200) || null,
    provider_job_id: text(metadata.provider_job_id, 300) || null,
    benchmark_suite_id: text(metadata.benchmark_suite_id, 200) || null,
    benchmark_suite_name: text(metadata.benchmark_suite_name, 300) || null,
    paired_provider_job_id: text(metadata.paired_provider_job_id, 300) || null,
    adapter_artifact_reference: text(metadata.adapter_artifact_reference, 1200) || null,
    candidate_id: text(metadata.candidate_id || metadata.model_candidate_id, 300) || null,
    production_model_promoted: metadata.production_model_promoted === true,
    production_release_authorized: metadata.production_release_authorized === true,
    release_ready: metadata.release_ready === true,
    explicit_production_release_required:
      metadata.explicit_production_release_required === true,
    comparison_eligible: comparison.eligible === true,
    case_count: Number(
      metadata.case_count ||
      metadata?.candidate_evaluation?.case_count ||
      metadata?.benchmark_readiness?.case_count ||
      0,
    ),
    training_metrics: Object.keys(trainingMetrics).length
      ? {
          optimizer_steps: Number(trainingMetrics.optimizer_steps || 0),
          mean_training_loss: Number(trainingMetrics.mean_training_loss || 0),
          holdout_loss: Number(trainingMetrics.holdout_loss || 0),
          method: text(trainingMetrics.method, 160) || null,
          base_precision: text(trainingMetrics.base_precision, 80) || null,
          base_quantized: trainingMetrics.base_quantized ?? null,
          moe_adapter_attachment_verified:
            trainingMetrics.moe_adapter_attachment_verified === true,
          bf16_gpu_preflight_verified:
            trainingMetrics.bf16_gpu_preflight_verified === true,
        }
      : null,
    canary: Object.keys(canary).length
      ? {
          status: text(canary.status, 120) || null,
          model_candidate_id: text(canary.model_candidate_id, 300) || null,
          adapter_artifact_reference:
            text(canary.adapter_artifact_reference, 1200) || null,
          exact_adapter_artifact_binding_verified:
            certification.exact_adapter_artifact_binding_verified === true,
          structured_output_ok: certification.structured_output_ok === true,
          native_tool_call_ok: certification.native_tool_call_ok === true,
        }
      : null,
  };
}

function latest(rows) {
  return list(rows).map(safeMetadata);
}

function lifecycleDecision(state) {
  const review = state.promotion_reviews[0] || null;
  const candidate = state.model_candidates[0] || null;
  const benchmarkRun = state.benchmark_runs[0] || null;
  const training = state.training_jobs[0] || null;

  if (
    review?.status === "CANARY_CERTIFIED_RELEASE_PENDING" &&
    review.release_ready === true &&
    review.production_model_promoted === false
  ) {
    return "READY_FOR_PRODUCTION_RELEASE_PLAN";
  }
  if (candidate?.status === "PROMOTION_REVIEW_ELIGIBLE") {
    return "MODEL_CANDIDATE_EXISTS_NEEDS_EXPLICIT_PROMOTION_REVIEW_CANARY";
  }
  if (benchmarkRun?.status === "BENCHMARK_SUBMITTED") {
    return "BENCHMARK_SUBMITTED_NEEDS_REFRESH_TO_TERMINAL_STATE";
  }
  if (
    benchmarkRun &&
    ["BENCHMARK_COMPLETED", "BENCHMARK_EVALUATED"].includes(benchmarkRun.status)
  ) {
    return "BENCHMARK_TERMINAL_BUT_MODEL_CANDIDATE_MISSING_RECONCILIATION_REQUIRED";
  }
  if (training?.status === "TRAINING_COMPLETED" && training.adapter_artifact_reference) {
    return "TRAINING_COMPLETED_NEEDS_GOVERNED_BENCHMARK_EXECUTION";
  }
  if (["TRAINING_SUBMITTED", "TRAINING_QUEUED", "TRAINING_RUNNING"].includes(training?.status)) {
    return "TRAINING_ACTIVE_NEEDS_COMPLETION_WATCH";
  }
  if (training?.status === "TRAINING_FAILED") {
    return "TRAINING_FAILED_REQUIRES_FAILURE_DIAGNOSIS";
  }
  if (training?.status === "PREPARED") {
    return "TRAINING_PREPARED_NEEDS_EXPLICIT_TRAINING_EXECUTION";
  }
  if (training) return `TRAINING_STATE_REQUIRES_REVIEW:${training.status || "UNKNOWN"}`;
  return "NO_MODEL_TRAINING_JOB_FOUND";
}

const env = await parseEnv();
const key = text(env.SUPABASE_SERVICE_ROLE_KEY, 12000);
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY_REQUIRED");
const target = supabaseTarget(env.NEXT_PUBLIC_SUPABASE_URL);

let organizationId = text(env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 200);
let organizationSource = organizationId ? "ENVIRONMENT" : "CANONICAL_DATABASE_RECORD";
if (!organizationId) {
  const organizations = await requestJson(target, key, "organizations", {
    select: "id,name,organization_type,status,organization_status",
    name: `eq.${CANONICAL_ORGANIZATION_NAME}`,
    organization_type: `eq.${CANONICAL_ORGANIZATION_TYPE}`,
    status: "eq.active",
    organization_status: "eq.ACTIVE",
    limit: "3",
  });
  if (organizations.length !== 1) {
    throw new Error(
      `AVANTIQO_LEARNING_ORGANIZATION_RESOLUTION_FAILED:matches=${organizations.length}`,
    );
  }
  organizationId = text(organizations[0]?.id, 200);
}
if (!organizationId) throw new Error("AVANTIQO_LEARNING_ORGANIZATION_ID_REQUIRED");

const state = {};
for (const [name, scope] of Object.entries(SCOPES)) {
  const rows = await requestJson(target, key, MEMORY_TABLE, {
    select: "id,subject,metadata,active,updated_at",
    organization_id: `eq.${organizationId}`,
    memory_scope: `eq.${scope}`,
    active: "eq.true",
    order: "updated_at.desc",
    limit: "20",
  });
  state[name] = latest(rows);
}

const result = {
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  supabase_target: {
    kind: target.kind,
    host: target.host,
    project_ref: target.project_ref,
  },
  learning_organization: {
    id: organizationId,
    source: organizationSource,
  },
  counts: Object.fromEntries(
    Object.entries(state).map(([name, rows]) => [name, rows.length]),
  ),
  latest: Object.fromEntries(
    Object.entries(state).map(([name, rows]) => [name, rows[0] || null]),
  ),
  lifecycle_state: lifecycleDecision(state),
  safety: {
    supabase_write_performed: false,
    runpod_request_performed: false,
    worker_scaling_mutated: false,
    provider_job_submitted: false,
    inference_performed: false,
    training_started: false,
    production_model_promoted: false,
    production_endpoint_mutated: false,
    secrets_printed: false,
  },
};

console.log(JSON.stringify(result, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_MODEL_IMPROVEMENT_LIFECYCLE_STATE=${result.lifecycle_state}`);
console.log("AVANTIQO_INTELLIGENCE_MODEL_IMPROVEMENT_STATE_INSPECT=PASS");
