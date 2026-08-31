import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_E2E_PROOF_V1";
const APPROVAL_ENV = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_APPROVED";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const ENDPOINT_NAME = "avantiqo-code-v1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const MODEL = "avantiqo-code-v1";
const CAPABILITY = "ai.code.debug";
const MODULE_NAME = "invoice-total.mjs";
const TEST_NAME = "invoice-total.test.mjs";
const SOURCE_BEGIN = "AVANTIQO_CODE_GENERATED_SOURCE_BEGIN";
const SOURCE_END = "AVANTIQO_CODE_GENERATED_SOURCE_END";
const TARGET_IDLE_TIMEOUT_SECONDS = 60;
const MAX_GENERATION_ATTEMPTS = 2;
const POLL_MS = 5_000;
const GENERATION_TIMEOUT_MS = 15 * 60_000;
const PARK_TIMEOUT_MS = 2 * 60_000;
const WAKE_PROPAGATION_ATTEMPTS = 24;
const WAKE_PROPAGATION_DELAY_MS = 2_000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"]);

const BUGGY_SOURCE = `export function invoiceTotal(subtotal, taxRate) {
  if (!Number.isFinite(subtotal) || !Number.isFinite(taxRate)) {
    throw new TypeError("subtotal and taxRate must be finite numbers");
  }
  return Number((subtotal + taxRate).toFixed(2));
}
`;

const TEST_SOURCE = `import assert from "node:assert/strict";
import { invoiceTotal } from "./invoice-total.mjs";

assert.equal(invoiceTotal(100, 0.07), 107);
assert.equal(invoiceTotal(19.99, 0.075), 21.49);
assert.equal(invoiceTotal(0, 0.2), 0);
assert.throws(() => invoiceTotal(Number.NaN, 0.07), TypeError);
assert.throws(() => invoiceTotal(100, Number.POSITIVE_INFINITY), TypeError);
console.log("AVANTIQO_CODE_FIXTURE_TEST_PASS");
`;

const text = (value, maximum = 12_000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const approved = (value) => ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

if (!approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED:set_${APPROVAL_ENV}=YES`);
}
if (text(process.env.NODE_ENV).toLowerCase() === "production") {
  throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2_000);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 2_000);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REQUIRED`);
if (!runtimeKey) throw new Error(`${CONTRACT}_RUNPOD_RUNTIME_KEY_REQUIRED`);

let endpointId = "";
let canonicalVolumeId = "";
let canonicalVolumeName = "";
let canonicalDataCenterId = "";
let wakeMutationPerformed = false;
let parkMutationPerformed = false;
let serverlessZeroIdleRestored = false;
let activeJobId = "";
let activeJobTerminal = true;
let generationAttempts = 0;
let inferencePerformed = false;
let generatedSource = "";
let generatedSourceSha256 = "";
let generatedTestsPassed = false;
let generatedCodeExecuted = false;
let sourceMutationPerformed = false;
let modelEvidence = null;
let finalTest = null;
let workspace = "";
let failure = null;

async function jsonResponse(response, label, { allow404 = false } = {}) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1_200) || "UNKNOWN"}`);
  }
  return body || {};
}

async function rest(pathname, options = {}) {
  return jsonResponse(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), `${CONTRACT}_REST`, { allow404: options.allow404 === true });
}

async function queue(pathname, options = {}) {
  return jsonResponse(await fetch(`${QUEUE}/${endpointId}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${runtimeKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), `${CONTRACT}_QUEUE`);
}

function rows(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const key of [...keys, "data", "items", "results", "endpoints", "networkVolumes", "volumes"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  return [];
}

function endpointVolumeIds(endpoint = {}) {
  const ids = [
    text(endpoint.networkVolumeId, 240),
    ...list(endpoint.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.id || entry?.networkVolumeId, 240)),
    text(endpoint.networkVolume?.id, 240),
  ].filter(Boolean);
  return [...new Set(ids)];
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: number(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: number(workers.idle, 0),
      initializing: number(workers.initializing, 0),
      ready: number(workers.ready, 0),
      running: number(workers.running, 0),
      throttled: number(workers.throttled, 0),
      unhealthy: number(workers.unhealthy, 0),
    },
  };
}

function hasJobs(summary) {
  return summary.jobs.in_queue > 0 || summary.jobs.in_progress > 0;
}
function hasWorkers(summary) {
  return Object.values(summary.workers).some((value) => Number(value) > 0);
}

async function endpointSnapshot() {
  const endpoint = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`);
  return {
    raw: endpoint,
    id: text(endpoint.id, 240),
    name: text(endpoint.name, 240),
    workers_min: number(endpoint.workersMin),
    workers_max: number(endpoint.workersMax),
    idle_timeout_seconds: number(endpoint.idleTimeout),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType, 80).toUpperCase() === "FLASHBOOT",
    volume_ids: endpointVolumeIds(endpoint),
    template_id: text(endpoint.templateId || endpoint.template?.id, 240) || null,
  };
}

async function setCapacity(workersMax, phase) {
  const before = await endpointSnapshot();
  if (before.id !== endpointId || before.name !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_${phase}_ENDPOINT_IDENTITY_INVALID`);
  if (before.workers_min !== 0 || ![0, 1].includes(before.workers_max)) {
    throw new Error(`${CONTRACT}_${phase}_WORKER_POLICY_INVALID:${before.workers_min}/${before.workers_max}`);
  }
  const needsMutation = before.workers_max !== workersMax || before.idle_timeout_seconds !== TARGET_IDLE_TIMEOUT_SECONDS;
  if (!needsMutation) return { before, after: before, mutated: false };
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax, idleTimeout: TARGET_IDLE_TIMEOUT_SECONDS },
  });
  const after = await endpointSnapshot();
  if (after.workers_min !== 0 || after.workers_max !== workersMax || after.idle_timeout_seconds !== TARGET_IDLE_TIMEOUT_SECONDS) {
    throw new Error(`${CONTRACT}_${phase}_VERIFY_FAILED:${JSON.stringify(after)}`);
  }
  if (after.volume_ids.length !== 1 || after.volume_ids[0] !== canonicalVolumeId) {
    throw new Error(`${CONTRACT}_${phase}_STORAGE_BINDING_CHANGED`);
  }
  return { before, after, mutated: true };
}

async function queueHealth() {
  return healthSummary(await queue("/health", { timeoutMs: 30_000 }));
}

function parseGeneratedFile(raw) {
  let candidate = text(raw);
  candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${CONTRACT}_GENERATED_JSON_OBJECT_REQUIRED`);
  let parsed;
  try { parsed = JSON.parse(candidate.slice(start, end + 1)); }
  catch (error) { throw new Error(`${CONTRACT}_GENERATED_JSON_INVALID:${text(error?.message, 500)}`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${CONTRACT}_GENERATED_JSON_OBJECT_REQUIRED`);
  if (Object.keys(parsed).sort().join(",") !== "content,path") throw new Error(`${CONTRACT}_GENERATED_JSON_KEYS_INVALID:${Object.keys(parsed).join(",")}`);
  if (text(parsed.path) !== MODULE_NAME) throw new Error(`${CONTRACT}_GENERATED_PATH_INVALID:${text(parsed.path)}`);
  const content = String(parsed.content ?? "");
  if (!content.trim() || content.length > 12_000) throw new Error(`${CONTRACT}_GENERATED_CONTENT_INVALID`);
  if (content === BUGGY_SOURCE) throw new Error(`${CONTRACT}_GENERATED_SOURCE_UNCHANGED`);
  const forbidden = [
    /\bimport\s*(?:\(|["\'])/i,
    /\brequire\s*\(/i,
    /\bprocess\b/i,
    /\bglobalThis\b/i,
    /\bfetch\s*\(/i,
    /\bWebSocket\b/i,
    /\bchild_process\b/i,
    /\bnode:/i,
    /\beval\s*\(/i,
    /\bnew\s+Function\b/i,
    /\bFunction\s*\(/i,
  ];
  if (forbidden.some((pattern) => pattern.test(content))) throw new Error(`${CONTRACT}_GENERATED_SOURCE_SECURITY_BOUNDARY_INVALID`);
  if (!/\bexport\s+(?:function|const|let|var)\s+invoiceTotal\b/.test(content)) throw new Error(`${CONTRACT}_GENERATED_EXPORT_REQUIRED`);
  return content.endsWith("\n") ? content : `${content}\n`;
}

function runFixtureTest(cwd) {
  const result = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${cwd}`, TEST_NAME], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: { PATH: process.env.PATH || "", HOME: cwd, TMPDIR: cwd, NODE_NO_WARNINGS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: String(result.stdout || "").slice(0, 6_000),
    stderr: String(result.stderr || "").slice(0, 6_000),
    error: result.error ? text(result.error?.message || result.error, 1_000) : null,
  };
}

async function cancelActiveJob() {
  if (!activeJobId || activeJobTerminal) return false;
  try {
    await queue(`/cancel/${encodeURIComponent(activeJobId)}`, { method: "POST", timeoutMs: 30_000 });
    activeJobTerminal = true;
    return true;
  } catch {
    return false;
  }
}

async function waitForJob(jobId) {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const body = await queue(`/status/${encodeURIComponent(jobId)}`, { timeoutMs: 30_000 });
    const status = text(body?.status).toUpperCase();
    if (status !== lastStatus) {
      console.log(JSON.stringify({ event: `${CONTRACT}_PROGRESS`, phase: "GENERATION_POLL", status, attempt: generationAttempts, secrets_printed: false }));
      lastStatus = status;
    }
    if (TERMINAL.has(status)) {
      activeJobTerminal = true;
      if (status !== "COMPLETED") throw new Error(`${CONTRACT}_GENERATION_${status}:${text(body?.error || body?.output?.error, 800) || "UNKNOWN"}`);
      if (!body?.output || typeof body.output !== "object") throw new Error(`${CONTRACT}_GENERATION_OUTPUT_REQUIRED`);
      return body.output;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_GENERATION_TIMEOUT`);
}

async function submitGeneration(currentSource, feedback) {
  generationAttempts += 1;
  const usageId = `serverless-real-write-${generationAttempts}-${crypto.randomUUID()}`;
  const instruction = [
    "Debug the supplied JavaScript module so the supplied Node test passes.",
    `Return ONLY strict JSON with exactly this shape: {\"path\":\"${MODULE_NAME}\",\"content\":\"<complete UTF-8 source file>\"}.`,
    "Do not use markdown fences and do not include commentary outside the JSON object.",
    `Modify only ${MODULE_NAME}; never modify ${TEST_NAME}.`,
    "The generated module must be self-contained and must not import modules, access environment variables, use the filesystem, start child processes, access the network, or use dynamic code evaluation.",
    "Keep the public export named invoiceTotal.",
    "Use the failing test as the authority for required behavior.",
  ].join(" ");
  const payload = {
    input: {
      contract: ENGINE_CONTRACT,
      capability: CAPABILITY,
      model: MODEL,
      organization_id: "benchmark-only",
      usage_id: usageId,
      instruction,
      structured_specification: {
        certification_probe: true,
        real_source_write_required: true,
        workspace: {
          files: [
            { path: MODULE_NAME, content: currentSource, editable: true },
            { path: TEST_NAME, content: TEST_SOURCE, editable: false },
          ],
          failing_command: `node --permission --allow-fs-read=<workspace> ${TEST_NAME}`,
          failing_output: text(feedback, 5_000),
        },
        output_contract: { format: "strict-json", path: MODULE_NAME, complete_file_content_required: true, markdown_forbidden: true },
        security_contract: {
          imports_forbidden: true,
          environment_access_forbidden: true,
          filesystem_access_forbidden: true,
          child_process_forbidden: true,
          network_access_forbidden: true,
          dynamic_code_evaluation_forbidden: true,
        },
        raw_reasoning_must_not_persist: true,
      },
    },
  };

  let accepted = null;
  for (let attempt = 1; attempt <= WAKE_PROPAGATION_ATTEMPTS; attempt += 1) {
    try {
      accepted = await queue("/run", { method: "POST", body: payload, timeoutMs: 30_000 });
      break;
    } catch (error) {
      const message = text(error?.message || error, 1_600);
      const paused = message.includes("HTTP_409") && message.includes("Endpoint is paused") && message.includes("max_workers=0");
      if (!paused || attempt >= WAKE_PROPAGATION_ATTEMPTS) throw error;
      await setCapacity(1, "WAKE_PROPAGATION");
      await sleep(WAKE_PROPAGATION_DELAY_MS);
    }
  }
  const jobId = text(accepted?.id || accepted?.job_id || accepted?.jobId, 240);
  if (!jobId) throw new Error(`${CONTRACT}_SERVERLESS_JOB_ID_REQUIRED`);
  activeJobId = jobId;
  activeJobTerminal = false;
  console.log(JSON.stringify({ event: `${CONTRACT}_PROGRESS`, phase: "SERVERLESS_JOB_ACCEPTED", attempt: generationAttempts, secrets_printed: false }));
  const output = await waitForJob(jobId);
  if (
    output?.status !== "completed" ||
    output?.provider !== "avantiqo-code" ||
    output?.model !== MODEL ||
    output?.engine_contract !== ENGINE_CONTRACT ||
    output?.capability !== CAPABILITY ||
    output?.raw_reasoning_persisted !== false
  ) {
    throw new Error(`${CONTRACT}_MODEL_OUTPUT_CONTRACT_INVALID:${text(output?.status || output?.error_code || output?.error_type, 300) || "UNKNOWN"}`);
  }
  if (!(Number(output?.usage?.input_tokens) > 0) || !(Number(output?.usage?.output_tokens) > 0)) {
    throw new Error(`${CONTRACT}_MODEL_USAGE_EVIDENCE_REQUIRED`);
  }
  inferencePerformed = true;
  modelEvidence = {
    provider: output.provider,
    model: output.model,
    foundation_model: output.foundation_model,
    runtime_model: output.runtime_model,
    serving_runtime: output.serving_runtime,
    quantization: output.quantization,
    usage: output.usage,
    generation_seconds: output.generation_seconds,
  };
  return text(output.result);
}

async function restoreZeroIdle() {
  await cancelActiveJob();
  const healthBefore = await queueHealth().catch(() => null);
  if (healthBefore && hasJobs(healthBefore)) {
    return { restored: false, reason: "CONCURRENT_OR_NONTERMINAL_WORK_PRESENT", health: healthBefore };
  }
  const parked = await setCapacity(0, "PARK");
  parkMutationPerformed = parkMutationPerformed || parked.mutated;
  const deadline = Date.now() + PARK_TIMEOUT_MS;
  let current = await queueHealth();
  while (Date.now() < deadline && hasWorkers(current)) {
    if (hasJobs(current)) {
      await setCapacity(1, "CONCURRENT_WORK_WAKE");
      return { restored: false, reason: "CONCURRENT_WORK_APPEARED", health: current };
    }
    await sleep(1_500);
    current = await queueHealth();
  }
  const endpoint = await endpointSnapshot();
  const restored = endpoint.workers_min === 0 && endpoint.workers_max === 0 && !hasJobs(current) && !hasWorkers(current);
  return { restored, reason: restored ? null : "ZERO_IDLE_SETTLE_FAILED", endpoint, health: current };
}

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  transport: "RUNPOD_SERVERLESS_ZERO_IDLE_FALLBACK",
  canonical_endpoint_storage_required: true,
  one_storage_only_required: true,
  workers_idle: "0/0",
  workers_active: "0/1",
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  workspace = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-serverless-real-write-"));
  await writeFile(path.join(workspace, MODULE_NAME), BUGGY_SOURCE, "utf8");
  await writeFile(path.join(workspace, TEST_NAME), TEST_SOURCE, "utf8");
  const initialTest = runFixtureTest(workspace);
  if (initialTest.error) throw new Error(`${CONTRACT}_INITIAL_TEST_RUNNER_ERROR:${initialTest.error}`);
  if (initialTest.status === 0) throw new Error(`${CONTRACT}_BROKEN_FIXTURE_MUST_FAIL_BEFORE_AI`);

  const [endpointRaw, volumesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true"),
    rest("/networkvolumes"),
  ]);
  const matches = rows(endpointRaw, ["endpoints"]).filter((entry) => text(entry?.name, 240) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_CODE_ENDPOINT_RESOLUTION:${matches.length}`);
  endpointId = text(matches[0].id, 240);
  if (!endpointId) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);
  const volumeIds = endpointVolumeIds(matches[0]);
  if (volumeIds.length !== 1) throw new Error(`${CONTRACT}_CODE_ENDPOINT_SINGLE_STORAGE_REQUIRED:${volumeIds.length}`);
  canonicalVolumeId = volumeIds[0];
  const volumeMatches = rows(volumesRaw, ["networkVolumes"]).filter((entry) => text(entry?.id, 240) === canonicalVolumeId);
  if (volumeMatches.length !== 1) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_RESOLUTION:${volumeMatches.length}`);
  canonicalVolumeName = text(volumeMatches[0]?.name, 240);
  canonicalDataCenterId = text(volumeMatches[0]?.dataCenterId ?? volumeMatches[0]?.data_center_id, 240);
  if (!/avantiqo.*code.*cache/i.test(canonicalVolumeName)) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_NAME_INVALID:${canonicalVolumeName}`);
  if (!canonicalDataCenterId) throw new Error(`${CONTRACT}_CANONICAL_VOLUME_DATACENTER_REQUIRED`);

  const endpointBefore = await endpointSnapshot();
  if (endpointBefore.volume_ids.length !== 1 || endpointBefore.volume_ids[0] !== canonicalVolumeId) throw new Error(`${CONTRACT}_ENDPOINT_STORAGE_VERIFY_FAILED`);
  if (endpointBefore.workers_min !== 0 || ![0, 1].includes(endpointBefore.workers_max)) throw new Error(`${CONTRACT}_ENDPOINT_WORKER_POLICY_INVALID`);
  const healthBefore = await queueHealth();
  if (hasJobs(healthBefore) || hasWorkers(healthBefore)) throw new Error(`${CONTRACT}_ENDPOINT_BUSY_BEFORE_PROOF:${JSON.stringify(healthBefore)}`);

  const wake = await setCapacity(1, "WAKE");
  wakeMutationPerformed = wake.mutated;
  console.log(JSON.stringify({
    event: `${CONTRACT}_PROGRESS`,
    phase: "SERVERLESS_WAKE_VERIFIED",
    endpoint_name: ENDPOINT_NAME,
    endpoint_id: endpointId,
    endpoint_single_storage_verified: true,
    network_volume_name: canonicalVolumeName,
    network_volume_id: canonicalVolumeId,
    data_center_id: canonicalDataCenterId,
    workers_min: 0,
    workers_max: 1,
    new_storage_created: false,
    volume_mutation_performed: false,
    secrets_printed: false,
  }));

  let currentSource = BUGGY_SOURCE;
  let feedback = `${initialTest.stdout}\n${initialTest.stderr}`;
  let lastAttemptError = "";
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let rawResult = "";
    try {
      rawResult = await submitGeneration(currentSource, feedback);
      const candidateSource = parseGeneratedFile(rawResult);
      const beforeHash = sha256(await readFile(path.join(workspace, MODULE_NAME), "utf8"));
      await writeFile(path.join(workspace, MODULE_NAME), candidateSource, "utf8");
      const afterSource = await readFile(path.join(workspace, MODULE_NAME), "utf8");
      const afterHash = sha256(afterSource);
      if (afterHash === beforeHash) throw new Error(`${CONTRACT}_SOURCE_HASH_MUST_CHANGE`);
      sourceMutationPerformed = true;
      finalTest = runFixtureTest(workspace);
      if (finalTest.error) throw new Error(`${CONTRACT}_GENERATED_TEST_RUNNER_ERROR:${finalTest.error}`);
      if (finalTest.status === 0) {
        generatedSource = afterSource;
        generatedSourceSha256 = afterHash;
        generatedCodeExecuted = true;
        generatedTestsPassed = true;
        lastAttemptError = "";
        break;
      }
      currentSource = afterSource;
      feedback = [
        `Attempt ${attempt} produced source that still fails the real test.`,
        `Current ${MODULE_NAME}:`,
        afterSource,
        "Test output:",
        finalTest.stdout,
        finalTest.stderr,
      ].join("\n").slice(0, 9_000);
      lastAttemptError = `${CONTRACT}_GENERATED_TESTS_FAILED_ATTEMPT_${attempt}`;
    } catch (error) {
      lastAttemptError = text(error?.message || error, 4_000);
      feedback = [
        `Attempt ${attempt} was rejected by the execution harness: ${lastAttemptError}`,
        "Return a corrected strict-JSON file replacement on the next attempt.",
        `Current ${MODULE_NAME}:`,
        currentSource,
        rawResult ? `Previous model output:\n${rawResult.slice(0, 5_000)}` : "",
      ].filter(Boolean).join("\n").slice(0, 9_000);
    }
  }
  if (!generatedTestsPassed) throw new Error(lastAttemptError || `${CONTRACT}_GENERATED_TESTS_NOT_GREEN`);
} catch (error) {
  failure = error;
} finally {
  try {
    const zeroIdle = endpointId ? await restoreZeroIdle() : { restored: true, reason: null };
    serverlessZeroIdleRestored = zeroIdle.restored === true;
    if (!serverlessZeroIdleRestored) {
      const cleanupError = new Error(`${CONTRACT}_ZERO_IDLE_RESTORE_FAILED:${zeroIdle.reason || "UNKNOWN"}`);
      if (!failure) failure = cleanupError;
      else failure = new Error(`${text(failure?.message)} | CLEANUP_ERROR:${cleanupError.message}`);
    }
  } catch (cleanupError) {
    if (!failure) failure = cleanupError;
    else failure = new Error(`${text(failure?.message)} | CLEANUP_ERROR:${text(cleanupError?.message || cleanupError)}`);
  }
  if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});
}

if (generatedTestsPassed && generatedSource) {
  console.log(SOURCE_BEGIN);
  process.stdout.write(generatedSource.endsWith("\n") ? generatedSource : `${generatedSource}\n`);
  console.log(SOURCE_END);
}

const report = {
  success: !failure && inferencePerformed && sourceMutationPerformed && generatedCodeExecuted && generatedTestsPassed && serverlessZeroIdleRestored,
  contract: CONTRACT,
  generated_file: { path: MODULE_NAME, content: generatedSource || null, sha256: generatedSourceSha256 || null },
  proof: {
    model_inference_performed: inferencePerformed,
    generation_attempts: generationAttempts,
    source_mutation_performed: sourceMutationPerformed,
    generated_code_executed: generatedCodeExecuted,
    generated_tests_passed: generatedTestsPassed,
    final_test_exit_code: finalTest?.status ?? null,
    model: modelEvidence,
  },
  runtime: {
    transport: "RUNPOD_SERVERLESS_ZERO_IDLE_FALLBACK",
    endpoint_name: ENDPOINT_NAME,
    endpoint_id: endpointId || null,
    endpoint_single_storage_verified: Boolean(canonicalVolumeId),
    network_volume_id: canonicalVolumeId || null,
    network_volume_name: canonicalVolumeName || null,
    data_center_id: canonicalDataCenterId || null,
    pod_created: false,
    wake_capacity_mutation_performed: wakeMutationPerformed,
    park_capacity_mutation_performed: parkMutationPerformed,
    serverless_zero_idle_restored: serverlessZeroIdleRestored,
    idle_workers_min: 0,
    idle_workers_max: 0,
  },
  safeguards: {
    new_storage_created: false,
    volume_mutation_performed: false,
    generated_code_network_permission: false,
    generated_code_child_process_permission: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
  failure: failure ? text(failure?.message || failure, 4_000) : null,
};
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}_ZERO_IDLE_RESTORED=${serverlessZeroIdleRestored}`);
console.log(`${CONTRACT}_GENERATED_CODE_EXECUTED=${generatedCodeExecuted}`);
console.log(`${CONTRACT}_GENERATED_TESTS_PASSED=${generatedTestsPassed}`);
console.log(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false`);
if (failure || !report.success) throw failure || new Error(`${CONTRACT}_FAILED`);
console.log(`${CONTRACT}=PASS`);
