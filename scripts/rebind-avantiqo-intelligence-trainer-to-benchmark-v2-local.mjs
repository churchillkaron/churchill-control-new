import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_TO_BENCHMARK_REBIND_V2";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-intelligence-benchmark-image.json";
const ENV_PATH = ".env.local";
const MIN_CONTAINER_DISK_GB = 30;
const MAX_MAIN_CONVERGENCE_ATTEMPTS = 6;
const PROTECTED_EXACT_PATHS = new Set([
  ".github/workflows/avantiqo-intelligence-benchmark-image.yml",
  "scripts/avantiqo-intelligence-model-benchmark-audit.mjs",
  "lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js",
  "lib/intelligence/runtime/AvantiqoModelBenchmarkEvaluationRuntime.js",
  "lib/intelligence/runtime/AvantiqoModelBenchmarkReadinessRuntime.js",
  "lib/intelligence/runtime/AvantiqoModelBenchmarkSuiteRuntime.js",
  "lib/intelligence/runtime/AvantiqoModelImprovementRuntime.js",
  "lib/intelligence/runtime/AvantiqoModelImprovementSafeLeaseGuard.js",
  "config/avantiqo-runpod-safe-lease-policy.json",
]);
const PROTECTED_PREFIXES = ["services/avantiqo-intelligence-benchmark/"];

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}
function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label}:exit=${result.status}:${text(result.stderr || result.stdout, 1200)}`);
  }
  return text(result.stdout, 120000);
}
function protectedMovement(paths) {
  return paths.filter((path) =>
    PROTECTED_EXACT_PATHS.has(path) ||
    PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix)),
  );
}
function convergeCurrentMain() {
  const branch = run("git", ["branch", "--show-current"], "BENCHMARK_REBIND_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`BENCHMARK_REBIND_MAIN_REQUIRED:${branch || "DETACHED"}`);
  for (let attempt = 1; attempt <= MAX_MAIN_CONVERGENCE_ATTEMPTS; attempt += 1) {
    run("git", ["fetch", "origin", "main"], "BENCHMARK_REBIND_GIT_FETCH_FAILED");
    const head = run("git", ["rev-parse", "HEAD"], "BENCHMARK_REBIND_GIT_HEAD_FAILED");
    const remote = run("git", ["rev-parse", "origin/main"], "BENCHMARK_REBIND_GIT_REMOTE_FAILED");
    if (head === remote) return head;
    const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", head, remote], {
      cwd: process.cwd(), env: process.env, encoding: "utf8",
    });
    if (ancestry.status !== 0) {
      throw new Error(`BENCHMARK_REBIND_MAIN_DIVERGED:head=${head}:origin_main=${remote}`);
    }
    const changed = run(
      "git",
      ["diff", "--name-only", `${head}..${remote}`],
      "BENCHMARK_REBIND_MAIN_DRIFT_DIFF_FAILED",
    ).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    const relevant = protectedMovement(changed);
    if (relevant.length) {
      throw new Error(`BENCHMARK_REBIND_RELEVANT_MAIN_MOVEMENT:${relevant.join(",")}`);
    }
    run("git", ["merge", "--ff-only", "origin/main"], "BENCHMARK_REBIND_MAIN_FAST_FORWARD_FAILED");
  }
  throw new Error(`BENCHMARK_REBIND_MAIN_CONVERGENCE_LIMIT:${MAX_MAIN_CONVERGENCE_ATTEMPTS}`);
}
function parseEnvFile() {
  let source = "";
  try { source = readFileSync(ENV_PATH, "utf8"); } catch { return {}; }
  const values = {};
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
    ) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}
function evidence() {
  const body = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
  if (
    body?.success !== true ||
    body?.contract !== "AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_RESULT_V2" ||
    body?.worker_contract !== "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1" ||
    body?.foundation_model !== "Qwen/Qwen3-30B-A3B-Thinking-2507" ||
    body?.canonical_case_count !== 60 ||
    body?.paired_baseline_candidate_execution !== true ||
    body?.provider_job_count !== 1 ||
    body?.single_runpod_job !== true ||
    body?.provider_job_submitted !== false ||
    body?.runpod_endpoint_mutated !== false ||
    body?.production_model_promoted !== false ||
    body?.production_web_deploy !== false ||
    !/^[a-f0-9]{40}$/i.test(text(body?.source_sha, 80)) ||
    !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(body?.immutable_image_reference, 1200))
  ) throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_IMAGE_V2_EVIDENCE_INVALID");
  return body;
}
function verifyImageSourceStillCurrent(imageSourceSha, mainCommit) {
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", imageSourceSha, mainCommit], {
    cwd: process.cwd(), env: process.env, encoding: "utf8",
  });
  if (ancestry.status !== 0) {
    throw new Error(`BENCHMARK_REBIND_IMAGE_SOURCE_NOT_ANCESTOR:${imageSourceSha}:${mainCommit}`);
  }
  if (imageSourceSha === mainCommit) return [];
  const changed = run(
    "git",
    ["diff", "--name-only", `${imageSourceSha}..${mainCommit}`],
    "BENCHMARK_REBIND_IMAGE_SOURCE_DIFF_FAILED",
  ).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const relevant = protectedMovement(changed);
  if (relevant.length) {
    throw new Error(`BENCHMARK_REBIND_IMAGE_SOURCE_STALE:${relevant.join(",")}`);
  }
  return changed;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw, 1000) || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

const mainCommit = convergeCurrentMain();
const image = evidence();
const unrelatedMovementSinceImage = verifyImageSourceStillCurrent(text(image.source_sha, 80), mainCommit);
const localEnv = parseEnvFile();
const runtimeEnv = (name) => text(process.env[name], 12000) || text(localEnv[name], 12000);
const managementKey = runtimeEnv("RUNPOD_MANAGEMENT_API_KEY") || runtimeEnv("RUNPOD_API_KEY");
const queueKey = runtimeEnv("RUNPOD_API_KEY") || managementKey;
const endpointId = runtimeEnv("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID");
if (!managementKey || !queueKey || !endpointId) throw new Error("BENCHMARK_REBIND_RUNPOD_ENV_REQUIRED");

async function rest(path, options = {}) {
  return readJson(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }),
    "AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_REST",
  );
}
async function health() {
  return readJson(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${queueKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    "AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_HEALTH",
  );
}
function counters(raw) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}
function activeManagementWorkers(endpoint) {
  const exited = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    if (desired && !exited.has(desired)) return true;
    return Boolean(status && !exited.has(status));
  });
}
function normalizedEnv(value) {
  return Object.fromEntries(Object.entries(object(value)).map(([key, val]) => [String(key), String(val ?? "")]));
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_V2_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_V2_APPROVED=YES_REQUIRED");
}

const [endpoints, templates, registryAuths, rawHealth] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true"),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
  rest("/containerregistryauth"),
  health(),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(registryAuths)) {
  throw new Error("BENCHMARK_REBIND_PROVIDER_LIST_INVALID");
}
const matches = endpoints.filter((entry) => text(entry?.id) === endpointId);
if (matches.length !== 1) throw new Error(`BENCHMARK_REBIND_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
const endpoint = matches[0];
if (text(endpoint?.name) !== TRAINER_ENDPOINT_NAME) throw new Error("BENCHMARK_REBIND_ENDPOINT_NAME_MISMATCH");

const queue = counters(rawHealth);
const activeWorkers = activeManagementWorkers(endpoint);
const queueWorkerCount = Object.values(queue.workers).reduce((sum, value) => sum + value, 0);
if (
  finite(endpoint?.workersMin) !== 0 ||
  finite(endpoint?.workersMax) !== 0 ||
  queue.jobs.in_queue !== 0 ||
  queue.jobs.in_progress !== 0 ||
  activeWorkers.length !== 0 ||
  queueWorkerCount !== 0
) {
  throw new Error(
    `BENCHMARK_REBIND_REQUIRES_RESTING_0_0:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}:queue=${queue.jobs.in_queue}:progress=${queue.jobs.in_progress}:workers=${activeWorkers.length + queueWorkerCount}`,
  );
}

const currentTemplateId = text(endpoint?.templateId || endpoint?.template?.id);
const currentTemplate = templates.find((entry) => text(entry?.id) === currentTemplateId) || object(endpoint?.template);
const currentRegistryAuthId = text(currentTemplate?.containerRegistryAuthId);
let registryAuth = currentRegistryAuthId
  ? registryAuths.find((entry) => text(entry?.id) === currentRegistryAuthId)
  : null;
if (!registryAuth) {
  const candidates = registryAuths.filter((entry) => /ghcr|github/i.test([
    entry?.name, entry?.registry, entry?.registryUrl, entry?.url,
  ].map((value) => text(value)).join(" ")));
  if (candidates.length !== 1) throw new Error(`BENCHMARK_REBIND_GHCR_AUTH_RESOLUTION_FAILED:${candidates.length}`);
  registryAuth = candidates[0];
}
const registryAuthId = text(registryAuth?.id);
if (!registryAuthId) throw new Error("BENCHMARK_REBIND_GHCR_AUTH_ID_REQUIRED");

const digest = text(image.immutable_image_reference, 1200).match(/@sha256:([a-f0-9]{64})$/i)?.[1];
if (!digest) throw new Error("BENCHMARK_REBIND_IMAGE_DIGEST_REQUIRED");
const templateName = `avantiqo-intelligence-benchmark-paired-${digest.slice(0, 12)}`;
const named = templates.filter((entry) => text(entry?.name) === templateName);
if (named.length > 1) throw new Error(`BENCHMARK_REBIND_TEMPLATE_AMBIGUOUS:${named.length}`);
let targetTemplate = named[0] || null;
const targetEnv = {
  ...normalizedEnv(currentTemplate?.env),
  AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED: "true",
  AVANTIQO_INTELLIGENCE_TRAINER_ENABLED: "false",
  HF_HOME: "/runpod-volume/huggingface-cache",
  TRANSFORMERS_CACHE: "/runpod-volume/huggingface-cache",
};
const desiredBody = {
  containerDiskInGb: Math.max(MIN_CONTAINER_DISK_GB, finite(currentTemplate?.containerDiskInGb)),
  containerRegistryAuthId: registryAuthId,
  dockerEntrypoint: [],
  dockerStartCmd: [],
  env: targetEnv,
  imageName: text(image.immutable_image_reference, 1200),
  isPublic: false,
  name: templateName,
  ports: [],
  readme: "Avantiqo paired single-job benchmark worker. Immutable digest-bound V2 evidence; no production promotion.",
  volumeInGb: finite(currentTemplate?.volumeInGb, 0),
  volumeMountPath: text(currentTemplate?.volumeMountPath, 200) || "/workspace",
};

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: mainCommit,
  image_source_sha: image.source_sha,
  unrelated_paths_since_image_count: unrelatedMovementSinceImage.length,
  evidence: {
    contract: image.contract,
    paired_baseline_candidate_execution: image.paired_baseline_candidate_execution,
    provider_job_count: image.provider_job_count,
    single_runpod_job: image.single_runpod_job,
    immutable_image_reference: image.immutable_image_reference,
  },
  endpoint: {
    id: endpointId,
    name: TRAINER_ENDPOINT_NAME,
    current_template_id: currentTemplateId,
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    network_volume_id: text(endpoint?.networkVolumeId) || null,
    gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value)).filter(Boolean),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout, null),
    queue,
    management_worker_count: activeWorkers.length,
  },
  target: {
    template_name: templateName,
    existing_template_found: Boolean(targetTemplate),
    image_name: desiredBody.imageName,
    image_is_digest_bound: true,
    docker_entrypoint: desiredBody.dockerEntrypoint,
    docker_start_cmd: desiredBody.dockerStartCmd,
    benchmark_enabled: targetEnv.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED,
    trainer_enabled: targetEnv.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED,
  },
  safety: {
    endpoint_id_preserved: true,
    endpoint_name_preserved: true,
    network_volume_preserved: true,
    gpu_pool_preserved: true,
    worker_limits_preserved: true,
    execution_timeout_preserved: true,
    provider_job_submitted: false,
    inference_performed: false,
    worker_scaling_mutated: false,
    production_model_promoted: false,
    production_endpoint_mutated: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(plan, null, 2));
if (!apply) {
  console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_V2_APPLIED=false");
  process.exit(0);
}

const before = {
  networkVolumeId: text(endpoint?.networkVolumeId),
  gpuTypeIds: list(endpoint?.gpuTypeIds),
  workersMin: finite(endpoint?.workersMin),
  workersMax: finite(endpoint?.workersMax),
  executionTimeout: endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout ?? null,
};
if (!targetTemplate) {
  targetTemplate = await rest("/templates", {
    method: "POST",
    body: { ...desiredBody, category: "NVIDIA", isServerless: true },
  });
} else {
  const imageMatches = text(targetTemplate?.imageName, 1200) === desiredBody.imageName;
  const enabledMatches = text(targetTemplate?.env?.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED, 40).toLowerCase() === "true";
  const entrypointMatches = JSON.stringify(list(targetTemplate?.dockerEntrypoint)) === "[]";
  const startCmdMatches = JSON.stringify(list(targetTemplate?.dockerStartCmd)) === "[]";
  if (!imageMatches || !enabledMatches || !entrypointMatches || !startCmdMatches) {
    targetTemplate = await rest(`/templates/${encodeURIComponent(text(targetTemplate.id))}/update`, {
      method: "POST",
      body: desiredBody,
    });
  }
}
const targetTemplateId = text(targetTemplate?.id);
if (!targetTemplateId) throw new Error("BENCHMARK_REBIND_TARGET_TEMPLATE_ID_REQUIRED");
const verifiedTemplate = await rest(`/templates/${encodeURIComponent(targetTemplateId)}`);
if (
  text(verifiedTemplate?.imageName, 1200) !== desiredBody.imageName ||
  text(verifiedTemplate?.env?.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED, 40).toLowerCase() !== "true" ||
  JSON.stringify(list(verifiedTemplate?.dockerEntrypoint)) !== "[]" ||
  JSON.stringify(list(verifiedTemplate?.dockerStartCmd)) !== "[]"
) throw new Error("BENCHMARK_REBIND_TARGET_TEMPLATE_VERIFY_FAILED");

if (currentTemplateId !== targetTemplateId) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { templateId: targetTemplateId },
  });
}
const verifiedEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true");
const verified = verifiedEndpoints.find((entry) => text(entry?.id) === endpointId);
if (!verified || text(verified?.templateId || verified?.template?.id) !== targetTemplateId) {
  throw new Error("BENCHMARK_REBIND_ENDPOINT_TEMPLATE_VERIFY_FAILED");
}
if (
  text(verified?.networkVolumeId) !== before.networkVolumeId ||
  JSON.stringify(list(verified?.gpuTypeIds)) !== JSON.stringify(before.gpuTypeIds) ||
  finite(verified?.workersMin) !== before.workersMin ||
  finite(verified?.workersMax) !== before.workersMax ||
  String(verified?.executionTimeoutMs ?? verified?.executionTimeout ?? "") !== String(before.executionTimeout ?? "")
) throw new Error("BENCHMARK_REBIND_ENDPOINT_INFRASTRUCTURE_CHANGED");
const verifiedHealth = counters(await health());
if (verifiedHealth.jobs.in_queue !== 0 || verifiedHealth.jobs.in_progress !== 0) {
  throw new Error("BENCHMARK_REBIND_POST_APPLY_QUEUE_NOT_EMPTY");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_TRAINER_BOUND_TO_PAIRED_BENCHMARK_V2",
  endpoint_id: endpointId,
  template_id: targetTemplateId,
  immutable_image_reference: image.immutable_image_reference,
  workers_min: finite(verified?.workersMin),
  workers_max: finite(verified?.workersMax),
  queue: verifiedHealth.jobs,
  safety: {
    provider_job_submitted: false,
    inference_performed: false,
    worker_scaling_mutated: false,
    production_model_promoted: false,
    production_endpoint_mutated: false,
    secrets_printed: false,
  },
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_REBIND_V2=PASS");
