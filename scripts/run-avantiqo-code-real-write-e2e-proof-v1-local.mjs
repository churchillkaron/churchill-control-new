import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V1";
const APPROVAL_ENV = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_APPROVED";
const REST = "https://rest.runpod.io/v1";
const POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3";
const IMAGE = process.env.AVANTIQO_CODE_E2E_IMAGE?.trim()
  || "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:764bcb2ce3636adc68ada7ce2a51d41de995e5e0d54e543b41044d76e5686535";
const NETWORK_VOLUME_ID = process.env.AVANTIQO_CODE_E2E_NETWORK_VOLUME_ID?.trim() || "7obluigbr0";
const DATA_CENTER_ID = process.env.AVANTIQO_CODE_E2E_DATA_CENTER_ID?.trim() || "US-CA-2";
const GPU_TYPE_IDS = (process.env.AVANTIQO_CODE_E2E_GPU_TYPE_IDS || "NVIDIA H100 80GB HBM3,NVIDIA H200,NVIDIA B200")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const ALLOWED_CUDA_VERSIONS = ["12.8", "12.9", "13.0"];
const HEALTH_TIMEOUT_MS = 12 * 60_000;
const GENERATION_TIMEOUT_MS = 15 * 60_000;
const CLEANUP_TIMEOUT_MS = 3 * 60_000;
const POLL_MS = 5_000;
const MAX_GENERATION_ATTEMPTS = 2;
const MODULE_NAME = "invoice-total.mjs";
const TEST_NAME = "invoice-total.test.mjs";
const REPORT_PATH = process.env.AVANTIQO_CODE_E2E_REPORT_PATH?.trim() || "";

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

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
const approved = (value) => ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());

if (!approved(process.env[APPROVAL_ENV])) {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED:set_${APPROVAL_ENV}=YES`);
}
if (text(process.env.NODE_ENV).toLowerCase() === "production") {
  throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
}
if (!GPU_TYPE_IDS.length) throw new Error(`${CONTRACT}_GPU_POOL_REQUIRED`);

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REQUIRED`);

const podToken = crypto.randomBytes(48).toString("base64url");
const podName = `avantiqo-code-real-write-e2e-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
let podId = "";
let podBaseUrl = "";
let podCreatePerformed = false;
let podDeleteVerified = false;
let inferencePerformed = false;
let sourceMutationPerformed = false;
let generatedCodeExecuted = false;
let generatedTestsPassed = false;
let generationAttempts = 0;
let generatedSource = "";
let generatedSourceSha256 = "";
let modelEvidence = null;
let workspace = "";
let failure = null;
let initialTest = null;
let finalTest = null;

async function rest(pathname, options = {}) {
  const response = await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (options.allow404 && response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${CONTRACT}_RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 900)}`);
  }
  return body || {};
}

async function podRequest(pathname, options = {}) {
  if (!podBaseUrl) throw new Error(`${CONTRACT}_POD_BASE_URL_REQUIRED`);
  const response = await fetch(`${podBaseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${podToken}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_POD_HTTP_${response.status}:${text(body?.detail || body?.error_message || raw).slice(0, 900)}`);
  }
  if (body?.contract !== POD_HTTP_CONTRACT || body?.transport !== "pod-http" || body?.raw_reasoning_persisted !== false) {
    throw new Error(`${CONTRACT}_POD_CONTRACT_INVALID`);
  }
  return body;
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${podBaseUrl}/health`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
      const raw = await response.text();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      last = `http=${response.status}:${raw.slice(0, 300)}`;
      if (
        response.ok
        && body?.success === true
        && body?.contract === POD_HTTP_CONTRACT
        && body?.transport === "pod-http"
        && body?.transport_mode === "async-job-polling"
        && body?.async_submit_path === "/v3/generations"
        && body?.async_status_path_template === "/v3/generations/{job_id}"
        && body?.cached_model_found === true
        && body?.raw_reasoning_persisted === false
      ) {
        return body;
      }
    } catch (error) {
      last = text(error?.message || error);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_POD_HEALTH_TIMEOUT:${last}`);
}

async function waitForGeneration(jobId) {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS;
  let lastStatus = "QUEUED";
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const body = await podRequest(`/v3/generations/${encodeURIComponent(jobId)}`, { timeoutMs: 15_000 });
    const status = text(body?.status).toUpperCase();
    if (status !== lastStatus) {
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_REAL_WRITE_E2E_PROGRESS",
        phase: "GENERATION_POLL",
        status,
        attempt: generationAttempts,
        secrets_printed: false,
      }));
      lastStatus = status;
    }
    if (status === "FAILED") {
      throw new Error(`${CONTRACT}_GENERATION_FAILED:${text(body?.error_type || body?.error_message) || "UNKNOWN"}`);
    }
    if (status === "SUCCEEDED") {
      if (!body?.output || typeof body.output !== "object") {
        throw new Error(`${CONTRACT}_GENERATION_OUTPUT_REQUIRED`);
      }
      return body.output;
    }
    if (!new Set(["QUEUED", "RUNNING"]).has(status)) {
      throw new Error(`${CONTRACT}_GENERATION_STATUS_INVALID:${status}`);
    }
  }
  throw new Error(`${CONTRACT}_GENERATION_TIMEOUT`);
}

async function generateRepair(currentSource, feedback) {
  generationAttempts += 1;
  const jobId = `real-write-e2e-${generationAttempts}-${crypto.randomUUID()}`;
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
    id: jobId,
    input: {
      contract: "AVANTIQO_CODE_ENGINE_V1",
      capability: "ai.code.debug",
      model: "avantiqo-code-v1",
      organization_id: "benchmark-only",
      usage_id: jobId,
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
          failing_output: text(feedback).slice(0, 5000),
        },
        output_contract: {
          format: "strict-json",
          path: MODULE_NAME,
          complete_file_content_required: true,
          markdown_forbidden: true,
        },
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
  const accepted = await podRequest("/v3/generations", {
    method: "POST",
    body: payload,
    timeoutMs: 30_000,
  });
  if (accepted?.success !== true || accepted?.status !== "QUEUED" || text(accepted?.job_id) !== jobId || accepted?.proxy_timeout_safe !== true) {
    throw new Error(`${CONTRACT}_GENERATION_ACCEPTANCE_INVALID`);
  }
  const output = await waitForGeneration(jobId);
  if (
    output?.status !== "completed"
    || output?.provider !== "avantiqo-code"
    || output?.model !== "avantiqo-code-v1"
    || output?.engine_contract !== "AVANTIQO_CODE_ENGINE_V1"
    || output?.capability !== "ai.code.debug"
    || output?.raw_reasoning_persisted !== false
  ) {
    throw new Error(`${CONTRACT}_MODEL_OUTPUT_CONTRACT_INVALID`);
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

function parseGeneratedFile(raw) {
  let candidate = text(raw);
  candidate = candidate.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${CONTRACT}_GENERATED_JSON_OBJECT_REQUIRED`);
  let parsed = null;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw new Error(`${CONTRACT}_GENERATED_JSON_INVALID:${text(error?.message)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${CONTRACT}_GENERATED_JSON_OBJECT_REQUIRED`);
  }
  if (Object.keys(parsed).sort().join(",") !== "content,path") {
    throw new Error(`${CONTRACT}_GENERATED_JSON_KEYS_INVALID:${Object.keys(parsed).join(",")}`);
  }
  if (text(parsed.path) !== MODULE_NAME) {
    throw new Error(`${CONTRACT}_GENERATED_PATH_INVALID:${text(parsed.path)}`);
  }
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
  if (forbidden.some((pattern) => pattern.test(content))) {
    throw new Error(`${CONTRACT}_GENERATED_SOURCE_SECURITY_BOUNDARY_INVALID`);
  }
  if (!/\bexport\s+(?:function|const|let|var)\s+invoiceTotal\b/.test(content)) {
    throw new Error(`${CONTRACT}_GENERATED_EXPORT_REQUIRED`);
  }
  return content.endsWith("\n") ? content : `${content}\n`;
}

function runFixtureTest(cwd) {
  const args = [
    "--permission",
    `--allow-fs-read=${cwd}`,
    TEST_NAME,
  ];
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH || "",
      HOME: cwd,
      TMPDIR: cwd,
      NODE_NO_WARNINGS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: String(result.stdout || "").slice(0, 6000),
    stderr: String(result.stderr || "").slice(0, 6000),
    error: result.error ? text(result.error?.message || result.error) : null,
  };
}

async function createPod() {
  const created = await rest("/pods", {
    method: "POST",
    timeoutMs: 60_000,
    body: {
      allowedCudaVersions: ALLOWED_CUDA_VERSIONS,
      cloudType: "SECURE",
      computeType: "GPU",
      containerDiskInGb: 50,
      dataCenterIds: [DATA_CENTER_ID],
      dataCenterPriority: "availability",
      env: { AVANTIQO_CODE_POD_TOKEN: podToken },
      gpuCount: 1,
      gpuTypeIds: GPU_TYPE_IDS,
      gpuTypePriority: "availability",
      imageName: IMAGE,
      interruptible: false,
      locked: false,
      name: podName,
      networkVolumeId: NETWORK_VOLUME_ID,
      ports: ["8000/http"],
      supportPublicIp: true,
      volumeMountPath: "/workspace",
    },
  });
  podId = text(created?.id);
  if (!podId) throw new Error(`${CONTRACT}_POD_ID_REQUIRED`);
  podCreatePerformed = true;
  podBaseUrl = `https://${podId}-8000.proxy.runpod.net`;
  return created;
}

async function deleteVerified() {
  if (!podId) return true;
  await rest(`/pods/${encodeURIComponent(podId)}`, {
    method: "DELETE",
    allow404: true,
  }).catch((error) => {
    if (!text(error?.message).includes("404")) throw error;
  });
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pod = await rest(`/pods/${encodeURIComponent(podId)}`, {
      allow404: true,
      timeoutMs: 15_000,
    });
    if (!pod) return true;
    const state = text(pod?.desiredStatus || pod?.status).toUpperCase();
    if (["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(state)) return true;
    await sleep(1500);
  }
  return false;
}

async function writeReport(report) {
  if (!REPORT_PATH) return;
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REAL_WRITE_E2E_START",
  contract: CONTRACT,
  image_digest: IMAGE.includes("@") ? IMAGE.split("@")[1] : null,
  network_volume_id: NETWORK_VOLUME_ID,
  data_center_id: DATA_CENTER_ID,
  gpu_type_ids: GPU_TYPE_IDS,
  max_generation_attempts: MAX_GENERATION_ATTEMPTS,
  persistent_repository_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

try {
  workspace = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-real-write-e2e-"));
  await writeFile(path.join(workspace, MODULE_NAME), BUGGY_SOURCE, "utf8");
  await writeFile(path.join(workspace, TEST_NAME), TEST_SOURCE, "utf8");

  initialTest = runFixtureTest(workspace);
  if (initialTest.error) throw new Error(`${CONTRACT}_INITIAL_TEST_RUNNER_ERROR:${initialTest.error}`);
  if (initialTest.status === 0) throw new Error(`${CONTRACT}_BROKEN_FIXTURE_MUST_FAIL_BEFORE_AI`);

  await createPod();
  const health = await waitForHealth();
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_REAL_WRITE_E2E_PROGRESS",
    phase: "POD_READY",
    cached_model_found: health.cached_model_found === true,
    engine_loaded: health.engine_loaded === true,
    engine_loading: health.engine_loading === true,
    secrets_printed: false,
  }));

  let currentSource = BUGGY_SOURCE;
  let feedback = `${initialTest.stdout}\n${initialTest.stderr}`;
  let lastAttemptError = "";

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    let rawResult = "";
    try {
      rawResult = await generateRepair(currentSource, feedback);
      const candidateSource = parseGeneratedFile(rawResult);
      const beforeHash = sha256(await readFile(path.join(workspace, MODULE_NAME), "utf8"));
      await writeFile(path.join(workspace, MODULE_NAME), candidateSource, "utf8");
      const afterSource = await readFile(path.join(workspace, MODULE_NAME), "utf8");
      const afterHash = sha256(afterSource);
      if (afterHash === beforeHash) throw new Error(`${CONTRACT}_SOURCE_HASH_MUST_CHANGE`);
      sourceMutationPerformed = true;

      const testRun = runFixtureTest(workspace);
      finalTest = testRun;
      if (testRun.error) throw new Error(`${CONTRACT}_GENERATED_TEST_RUNNER_ERROR:${testRun.error}`);
      if (testRun.status === 0) {
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
        testRun.stdout,
        testRun.stderr,
      ].join("\n").slice(0, 9000);
      lastAttemptError = `${CONTRACT}_GENERATED_TESTS_FAILED_ATTEMPT_${attempt}`;
    } catch (error) {
      lastAttemptError = text(error?.message || error);
      feedback = [
        `Attempt ${attempt} was rejected by the execution harness: ${lastAttemptError}`,
        "Return a corrected strict-JSON file replacement on the next attempt.",
        `Current ${MODULE_NAME}:`,
        currentSource,
        rawResult ? `Previous model output:\n${rawResult.slice(0, 5000)}` : "",
      ].filter(Boolean).join("\n").slice(0, 9000);
    }
  }

  if (!generatedTestsPassed) {
    throw new Error(lastAttemptError || `${CONTRACT}_GENERATED_TESTS_NOT_GREEN`);
  }
} catch (error) {
  failure = error;
} finally {
  try {
    podDeleteVerified = await deleteVerified();
  } catch (cleanupError) {
    if (!failure) failure = cleanupError;
    else failure = new Error(`${text(failure?.message)} | CLEANUP_ERROR:${text(cleanupError?.message)}`);
  }
}

const report = {
  success: !failure
    && initialTest?.status !== 0
    && inferencePerformed
    && sourceMutationPerformed
    && generatedCodeExecuted
    && generatedTestsPassed
    && podCreatePerformed
    && podDeleteVerified,
  contract: CONTRACT,
  proof: {
    broken_fixture_failed_before_ai: initialTest?.status !== 0,
    model_inference_performed: inferencePerformed,
    generation_attempts: generationAttempts,
    source_mutation_performed: sourceMutationPerformed,
    generated_source_sha256: generatedSourceSha256 || null,
    generated_source_bytes: generatedSource ? Buffer.byteLength(generatedSource, "utf8") : 0,
    generated_code_executed: generatedCodeExecuted,
    generated_tests_passed: generatedTestsPassed,
    final_test_exit_code: finalTest?.status ?? null,
    model: modelEvidence,
  },
  runtime: {
    pod_created: podCreatePerformed,
    pod_delete_verified: podDeleteVerified,
    image_digest: IMAGE.includes("@") ? IMAGE.split("@")[1] : null,
    network_volume_id: NETWORK_VOLUME_ID,
    data_center_id: DATA_CENTER_ID,
    gpu_type_ids: GPU_TYPE_IDS,
  },
  safeguards: {
    generated_code_node_permission_model: true,
    generated_code_network_permission: false,
    generated_code_child_process_permission: false,
    generated_code_environment_inheritance: false,
    persistent_repository_mutation_performed: false,
    github_write_performed_by_generated_code: false,
    serverless_mutation_performed: false,
    volume_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
  failure: failure ? text(failure?.message || failure).slice(0, 2000) : null,
};

try {
  await writeReport(report);
} finally {
  if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});
}

console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}_POD_DELETE_VERIFIED=${podDeleteVerified}`);
console.log(`${CONTRACT}_SOURCE_MUTATION_PERFORMED=${sourceMutationPerformed}`);
console.log(`${CONTRACT}_GENERATED_CODE_EXECUTED=${generatedCodeExecuted}`);
console.log(`${CONTRACT}_GENERATED_TESTS_PASSED=${generatedTestsPassed}`);
console.log(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false`);
if (!report.success) {
  throw failure || new Error(`${CONTRACT}_FINAL_STATE_INVALID`);
}
console.log(`${CONTRACT}=PASS`);
