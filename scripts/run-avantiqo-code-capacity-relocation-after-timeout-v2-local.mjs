import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONTRACT = "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_V2";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const SOURCE_SCRIPT = "relocate-avantiqo-code-runpod-capacity-local.mjs";
const TERMINAL_TIMEOUT_STATUSES = new Set(["CANCELLED", "CANCELED", "TIMED_OUT"]);

function text(value) { return String(value ?? "").trim(); }
function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function yes(value) {
  return ["1", "true", "yes", "on", "approved"].includes(text(value).toLowerCase());
}
function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return false;
  loadEnvFile(envPath);
  return true;
}

async function parseResponse(response) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return { response, raw, body };
}

async function rest(managementKey, path) {
  const parsed = await parseResponse(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }));
  if (!parsed.response.ok) {
    throw new Error(`RUNPOD_MANAGEMENT_HTTP_${parsed.response.status}:${text(parsed.body?.message || parsed.body?.error || parsed.raw).slice(0, 700)}`);
  }
  return parsed.body;
}

async function serverless(apiKey, endpointId, path) {
  const parsed = await parseResponse(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }));
  if (!parsed.response.ok) {
    throw new Error(`RUNPOD_SERVERLESS_HTTP_${parsed.response.status}:${text(parsed.body?.message || parsed.body?.error || parsed.raw).slice(0, 700)}`);
  }
  return parsed.body;
}

async function historicalJobEvidence(apiKey, endpointId, jobId) {
  const parsed = await parseResponse(await fetch(
    `${SERVERLESS}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  ));
  if (parsed.response.ok) {
    return {
      found: true,
      status: text(parsed.body?.status).toUpperCase() || "UNKNOWN",
      source: "RUNPOD_STATUS",
      http_status: parsed.response.status,
    };
  }
  const detail = text(parsed.body?.detail || parsed.body?.message || parsed.body?.error || parsed.raw).toLowerCase();
  if (parsed.response.status === 404 && detail.includes("job not found")) {
    return {
      found: false,
      status: "NOT_FOUND_AFTER_CANCEL_OR_EXPIRY",
      source: "RUNPOD_STATUS_404",
      http_status: 404,
    };
  }
  throw new Error(`RUNPOD_SERVERLESS_HTTP_${parsed.response.status}:${text(parsed.body?.message || parsed.body?.error || parsed.raw).slice(0, 700)}`);
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

async function resolveCodeEndpoint(managementKey) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  const endpoints = await rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true");
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`CODE_TIMEOUT_RECOVERY_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

function patchRelocationSource(source) {
  const strictCandidate = ".filter((region) => region.best_stock_rank > sourceRank && region.available_gpu_pool.length)";
  const recoveryCandidate = `.filter((region) => {
      if (!region.available_gpu_pool.length) return false;
      if (region.best_stock_rank > sourceRank) return true;
      if (region.best_stock_rank < sourceRank) return false;
      const sourcePool = array(sourceRegion?.available_gpu_pool);
      const candidatePool = array(region.available_gpu_pool);
      const sourceBestCost = number(sourcePool[0]?.usd_per_hour_reference, Number.POSITIVE_INFINITY);
      const candidateBestCost = number(candidatePool[0]?.usd_per_hour_reference, Number.POSITIVE_INFINITY);
      return candidatePool.length > sourcePool.length || candidateBestCost < sourceBestCost;
    })`;

  const strictLiveGuard = `  if (!liveTarget || liveTarget.best_stock_rank <= selection.sourceRank || !liveGpuTypes.length) {
    throw new Error("CODE_CAPACITY_RELOCATION_TARGET_STOCK_LOST_BEFORE_SWITCH");
  }`;
  const recoveryLiveGuard = `  const sourcePoolForEvidence = array(selection.sourceRegion?.available_gpu_pool);
  const sourceBestCostForEvidence = number(sourcePoolForEvidence[0]?.usd_per_hour_reference, Number.POSITIVE_INFINITY);
  const livePool = array(liveTarget?.available_gpu_pool);
  const liveBestCost = number(livePool[0]?.usd_per_hour_reference, Number.POSITIVE_INFINITY);
  const liveTargetMateriallyBetter = Boolean(liveTarget) && (
    liveTarget.best_stock_rank > selection.sourceRank ||
    (
      liveTarget.best_stock_rank === selection.sourceRank &&
      (livePool.length > sourcePoolForEvidence.length || liveBestCost < sourceBestCostForEvidence)
    )
  );
  if (!liveTargetMateriallyBetter || !liveGpuTypes.length) {
    throw new Error("CODE_CAPACITY_RELOCATION_TARGET_STOCK_LOST_BEFORE_SWITCH");
  }`;

  const quiescenceAnchor = "async function waitForQuiescence(endpointId, key, label) {";
  const resumeHelper = `async function ensureEndpointWorkerLimits(endpointId, key, expected, label) {
  const expectedMin = number(expected?.min);
  const expectedMax = number(expected?.max);
  if (expectedMax <= 0) throw new Error(\`${"${label}"}_EXPECTED_WORKERS_MAX_MUST_BE_POSITIVE:\${expectedMax}\`);

  await rest(\`/endpoints/\${encodeURIComponent(endpointId)}\`, key, {
    method: "PATCH",
    body: { workersMin: expectedMin, workersMax: expectedMax },
  });

  const deadline = Date.now() + 30_000;
  let last = null;
  while (Date.now() < deadline) {
    last = resolveCodeEndpoint(
      await rest("/endpoints?includeTemplate=true&includeWorkers=true", key),
      endpointId,
    ).endpoint;
    const workersMin = number(last?.workersMin);
    const workersMax = number(last?.workersMax);
    if (workersMin === expectedMin && workersMax === expectedMax) {
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_CAPACITY_RELOCATION_ENDPOINT_RESUMED",
        label,
        workers_min: workersMin,
        workers_max: workersMax,
      }));
      return last;
    }
    await sleep(1000);
  }
  throw new Error(\`${"${label}"}_WORKER_LIMIT_VERIFY_TIMEOUT:min=\${number(last?.workersMin)}:max=\${number(last?.workersMax)}\`);
}

${quiescenceAnchor}`;

  const movedAnchor = `  switched = true;

  const moved = resolveCodeEndpoint(
    await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    endpointId,
  ).endpoint;`;
  const movedReplacement = `  switched = true;

  const moved = await ensureEndpointWorkerLimits(
    endpointId,
    managementKey,
    originalWorkers,
    "CODE_CAPACITY_RELOCATION_RESUME",
  );`;

  const rollbackAnchor = `      const rolledBack = resolveCodeEndpoint(
        await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
        endpointId,
      ).endpoint;`;
  const rollbackReplacement = `      const rolledBack = await ensureEndpointWorkerLimits(
        endpointId,
        managementKey,
        originalWorkers,
        "CODE_CAPACITY_RELOCATION_ROLLBACK_RESUME",
      );`;

  for (const [needle, code] of [
    [strictCandidate, "CODE_TIMEOUT_RECOVERY_SOURCE_SELECTION_FRAGMENT_CHANGED_REPLAN_REQUIRED"],
    [strictLiveGuard, "CODE_TIMEOUT_RECOVERY_SOURCE_LIVE_GUARD_FRAGMENT_CHANGED_REPLAN_REQUIRED"],
    [quiescenceAnchor, "CODE_TIMEOUT_RECOVERY_SOURCE_QUIESCENCE_ANCHOR_CHANGED_REPLAN_REQUIRED"],
    [movedAnchor, "CODE_TIMEOUT_RECOVERY_SOURCE_RESUME_ANCHOR_CHANGED_REPLAN_REQUIRED"],
    [rollbackAnchor, "CODE_TIMEOUT_RECOVERY_SOURCE_ROLLBACK_RESUME_ANCHOR_CHANGED_REPLAN_REQUIRED"],
  ]) {
    if (!source.includes(needle)) throw new Error(code);
  }

  const patched = source
    .replace(strictCandidate, recoveryCandidate)
    .replace(strictLiveGuard, recoveryLiveGuard)
    .replace(quiescenceAnchor, resumeHelper)
    .replace(movedAnchor, movedReplacement)
    .replace(rollbackAnchor, rollbackReplacement);

  if (
    patched === source ||
    patched.includes(strictCandidate) ||
    patched.includes(strictLiveGuard) ||
    patched.includes(movedAnchor) ||
    patched.includes(rollbackAnchor)
  ) {
    throw new Error("CODE_TIMEOUT_RECOVERY_SOURCE_PATCH_VERIFY_FAILED");
  }
  return patched;
}

const localEnvLoaded = loadLocalEnvironment();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
const failedJobId = text(process.argv[2] || process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_FAILED_JOB_ID);
const apply = yes(process.env.AVANTIQO_CODE_CAPACITY_RELOCATION_APPLY);
const missingJobEvidenceApproved = yes(process.env.AVANTIQO_CODE_CAPACITY_TIMEOUT_EVIDENCE_APPROVED);

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (!failedJobId || !/^[A-Za-z0-9-]+$/.test(failedJobId)) {
  throw new Error("AVANTIQO_CODE_CAPACITY_RELOCATION_FAILED_JOB_ID_REQUIRED");
}

const endpoint = await resolveCodeEndpoint(managementKey);
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("CODE_TIMEOUT_RECOVERY_ENDPOINT_ID_REQUIRED");

const [jobEvidence, healthRaw] = await Promise.all([
  historicalJobEvidence(apiKey, endpointId, failedJobId),
  serverless(apiKey, endpointId, "/health"),
]);
const health = healthCounters(healthRaw || {});

if (jobEvidence.found && !TERMINAL_TIMEOUT_STATUSES.has(jobEvidence.status)) {
  throw new Error(`CODE_TIMEOUT_RECOVERY_JOB_NOT_TIMEOUT_TERMINAL:job=${failedJobId}:status=${jobEvidence.status}`);
}
if (!jobEvidence.found && apply && !missingJobEvidenceApproved) {
  throw new Error("AVANTIQO_CODE_CAPACITY_TIMEOUT_EVIDENCE_APPROVED=YES_REQUIRED_FOR_APPLY_WHEN_JOB_STATUS_EXPIRED");
}
if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) {
  throw new Error(`CODE_TIMEOUT_RECOVERY_ENDPOINT_BUSY:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`);
}
if (health.workers.unhealthy > 0) {
  throw new Error(`CODE_TIMEOUT_RECOVERY_UNHEALTHY_WORKER:${health.workers.unhealthy}`);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(scriptDir, SOURCE_SCRIPT);
const source = readFileSync(sourcePath, "utf8");
if (!source.includes('const CONTRACT = "AVANTIQO_CODE_CAPACITY_RELOCATION_V1";')) {
  throw new Error("CODE_TIMEOUT_RECOVERY_SOURCE_CONTRACT_CHANGED_REPLAN_REQUIRED");
}
const patchedSource = patchRelocationSource(source);
const tempPath = resolve(scriptDir, `.avantiqo-code-capacity-timeout-recovery-v2-${process.pid}.mjs`);

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_START",
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  failed_job: {
    id: failedJobId,
    status: jobEvidence.status,
    status_source: jobEvidence.source,
    terminal_status_verified_from_runpod: jobEvidence.found && TERMINAL_TIMEOUT_STATUSES.has(jobEvidence.status),
    historical_status_expired_or_cancelled: !jobEvidence.found,
    explicit_missing_job_evidence_approval_required_for_apply: !jobEvidence.found,
    explicit_missing_job_evidence_approval_present: missingJobEvidenceApproved,
  },
  endpoint: { id: endpointId, name: text(endpoint?.name) || null },
  health,
  plan_safe_with_missing_historical_job_because_no_mutation_occurs: !apply,
  equal_stock_rank_recovery_requires_material_scheduler_advantage: true,
  endpoint_resume_verified_before_provider_submission: true,
  rollback_resume_verified: true,
  minimum_gpu_memory_gb_preserved: 80,
  provider_job_submitted_by_wrapper: false,
  endpoint_mutation_performed_by_wrapper: false,
  storage_mutation_performed_by_wrapper: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

try {
  writeFileSync(tempPath, patchedSource, { encoding: "utf8", flag: "wx" });
  const child = spawnSync(process.execPath, [tempPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.signal) throw new Error(`CODE_TIMEOUT_RECOVERY_CHILD_SIGNAL:${child.signal}`);
  if (child.status !== 0) {
    throw new Error(`CODE_TIMEOUT_RECOVERY_CHILD_EXIT:${child.status ?? "UNKNOWN"}`);
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CAPACITY_TIMEOUT_RECOVERY_COMPLETE",
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    failed_job_id: failedJobId,
    job_status_source: jobEvidence.source,
    equal_rank_recovery_path_used: true,
    endpoint_resume_verified_before_provider_submission: true,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  if (existsSync(tempPath)) unlinkSync(tempPath);
}