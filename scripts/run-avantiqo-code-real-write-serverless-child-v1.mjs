import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_CHILD_V1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const API_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = String(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID || "r79dtnjnrilrlc").trim();
const REPORT_PATH = String(process.env.AVANTIQO_CODE_E2E_REPORT_PATH || "").trim();
const MODULE_NAME = "invoice-total.mjs";
const TEST_NAME = "invoice-total.test.mjs";
const POLL_MS = 2500;
const JOB_TIMEOUT_MS = 12 * 60_000;

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
const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY);
if (!apiKey) throw new Error(`${CONTRACT}_RUNPOD_CODE_API_KEY_REQUIRED`);
if (!ENDPOINT_ID) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);

async function request(pathname, options = {}) {
  const response = await fetch(`${API_BASE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${CONTRACT}_RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 800)}`);
  return body || {};
}

function runFixture(cwd) {
  const result = spawnSync(process.execPath, ["--permission", `--allow-fs-read=${cwd}`, TEST_NAME], {
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
    error: result.error ? text(result.error?.message || result.error) : null,
    stdout: String(result.stdout || "").slice(0, 6000),
    stderr: String(result.stderr || "").slice(0, 6000),
  };
}

function parseGeneratedFile(raw) {
  let candidate = text(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${CONTRACT}_GENERATED_JSON_REQUIRED`);
  let parsed = null;
  try { parsed = JSON.parse(candidate.slice(start, end + 1)); }
  catch (error) { throw new Error(`${CONTRACT}_GENERATED_JSON_INVALID:${text(error?.message)}`); }
  if (!parsed || Object.keys(parsed).sort().join(",") !== "content,path") {
    throw new Error(`${CONTRACT}_GENERATED_JSON_SHAPE_INVALID`);
  }
  if (text(parsed.path) !== MODULE_NAME) throw new Error(`${CONTRACT}_GENERATED_PATH_INVALID`);
  const content = String(parsed.content ?? "");
  if (!content.trim() || content.length > 12000 || content === BUGGY_SOURCE) {
    throw new Error(`${CONTRACT}_GENERATED_CONTENT_INVALID`);
  }
  const forbidden = [
    /\bimport\s*(?:\(|["'])/i,
    /\brequire\s*\(/i,
    /\bprocess\b/i,
    /\bglobalThis\b/i,
    /\bfetch\s*\(/i,
    /\bWebSocket\b/i,
    /\bchild_process\b/i,
    /\bnode:/i,
    /\beval\s*\(/i,
    /\bnew\s+Function\b/i,
  ];
  if (forbidden.some((pattern) => pattern.test(content))) {
    throw new Error(`${CONTRACT}_GENERATED_SOURCE_SECURITY_BOUNDARY_INVALID`);
  }
  if (!/\bexport\s+(?:function|const|let|var)\s+invoiceTotal\b/.test(content)) {
    throw new Error(`${CONTRACT}_GENERATED_EXPORT_REQUIRED`);
  }
  return content.endsWith("\n") ? content : `${content}\n`;
}

async function submitAndWait(initialTest) {
  const usageId = `real-write-${crypto.randomUUID()}`;
  const instruction = [
    "Debug the supplied JavaScript module so every supplied assertion passes.",
    `Return ONLY strict JSON exactly shaped {\"path\":\"${MODULE_NAME}\",\"content\":\"<complete UTF-8 source file>\"}.`,
    "No markdown and no commentary outside the JSON object.",
    `Modify only ${MODULE_NAME}; ${TEST_NAME} is immutable executable specification.`,
    "The generated module must be self-contained with no imports, environment access, filesystem, child process, network, or dynamic code evaluation.",
    "Keep the public export invoiceTotal.",
  ].join(" ");
  const submitted = await request("/run", {
    method: "POST",
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.code.debug",
        foundation_model: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: usageId,
        instruction,
        structured_specification: {
          certification_contract: CONTRACT,
          real_source_write_required: true,
          files: [
            { path: MODULE_NAME, content: BUGGY_SOURCE, editable: true },
            { path: TEST_NAME, content: TEST_SOURCE, editable: false },
          ],
          failing_output: `${initialTest.stdout}\n${initialTest.stderr}`.slice(0, 5000),
          output_contract: { format: "strict-json", path: MODULE_NAME, complete_file_content_required: true },
          raw_reasoning_must_not_persist: true,
        },
      },
    },
  });
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let lastStatus = text(submitted?.status).toUpperCase();
  while (Date.now() < deadline) {
    const body = await request(`/status/${encodeURIComponent(jobId)}`);
    const status = text(body?.status).toUpperCase();
    if (status !== lastStatus) {
      console.log(JSON.stringify({ event: "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_PROGRESS", status, secrets_printed: false }));
      lastStatus = status;
    }
    if (status === "COMPLETED") return { body, jobId };
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      throw new Error(`${CONTRACT}_JOB_${status}:${text(body?.error || body?.message)}`);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_JOB_TIMEOUT`);
}

let workspace = "";
let report = null;
try {
  workspace = await mkdtemp(path.join(os.tmpdir(), "avantiqo-code-real-write-serverless-"));
  await writeFile(path.join(workspace, MODULE_NAME), BUGGY_SOURCE, "utf8");
  await writeFile(path.join(workspace, TEST_NAME), TEST_SOURCE, "utf8");
  const initialTest = runFixture(workspace);
  if (initialTest.error) throw new Error(`${CONTRACT}_INITIAL_TEST_RUNNER_ERROR:${initialTest.error}`);
  if (initialTest.status === 0) throw new Error(`${CONTRACT}_BROKEN_FIXTURE_MUST_FAIL_BEFORE_AI`);

  const { body, jobId } = await submitAndWait(initialTest);
  const output = body?.output || {};
  if (
    text(output?.provider) !== "avantiqo-code" ||
    text(output?.engine_contract) !== ENGINE_CONTRACT ||
    text(output?.capability) !== "ai.code.debug" ||
    output?.raw_reasoning_persisted !== false ||
    !(Number(output?.usage?.input_tokens) > 0) ||
    !(Number(output?.usage?.output_tokens) > 0)
  ) throw new Error(`${CONTRACT}_MODEL_OUTPUT_CONTRACT_INVALID`);

  const generated = parseGeneratedFile(output?.result);
  const before = sha256(await readFile(path.join(workspace, MODULE_NAME), "utf8"));
  await writeFile(path.join(workspace, MODULE_NAME), generated, "utf8");
  const afterSource = await readFile(path.join(workspace, MODULE_NAME), "utf8");
  const after = sha256(afterSource);
  if (after === before) throw new Error(`${CONTRACT}_SOURCE_HASH_MUST_CHANGE`);

  const finalTest = runFixture(workspace);
  if (finalTest.error) throw new Error(`${CONTRACT}_FINAL_TEST_RUNNER_ERROR:${finalTest.error}`);
  if (finalTest.status !== 0) {
    throw new Error(`${CONTRACT}_GENERATED_TEST_FAILED:${`${finalTest.stdout}\n${finalTest.stderr}`.slice(0, 1200)}`);
  }

  report = {
    success: true,
    contract: CONTRACT,
    proof: {
      broken_fixture_failed_before_ai: true,
      model_inference_performed: true,
      source_mutation_performed: true,
      generated_source_sha256: after,
      generated_source_bytes: Buffer.byteLength(afterSource, "utf8"),
      generated_code_executed: true,
      generated_tests_passed: true,
      final_test_exit_code: finalTest.status,
      job_id_present: Boolean(jobId),
      model: {
        provider: output.provider,
        foundation_model: output.foundation_model,
        runtime_model: output.runtime_model,
        serving_runtime: output.serving_runtime,
        quantization: output.quantization,
        usage: output.usage,
      },
    },
    runtime: {
      transport: "runpod-serverless-safe-lease",
      endpoint_id_present: true,
      provider_job_completed: true,
    },
    safeguards: {
      generated_code_node_permission_model: true,
      generated_code_network_permission: false,
      generated_code_child_process_permission: false,
      generated_code_environment_inheritance: false,
      persistent_repository_mutation_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    },
  };
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_REAL_WRITE_SERVERLESS_PASS",
    contract: CONTRACT,
    source_mutation_performed: true,
    generated_code_executed: true,
    generated_tests_passed: true,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
} finally {
  if (report && REPORT_PATH) {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});
}

if (!report?.success) throw new Error(`${CONTRACT}_FINAL_STATE_INVALID`);
console.log(`${CONTRACT}=PASS`);
