import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_EPHEMERAL_POD_REAL_WRITE_PROOF_V1";
const BASE_V3_PATH = "scripts/run-avantiqo-code-ephemeral-pod-generation-proof-v3-local.mjs";
const APPROVAL_ENV = "AVANTIQO_CODE_EPHEMERAL_POD_REAL_WRITE_PROOF_APPROVED";
const BASE_APPROVAL_ENV = "AVANTIQO_CODE_EPHEMERAL_POD_GENERATION_PROOF_V3_APPROVED";
const RAW_OUTPUT_ENV = "AVANTIQO_CODE_EPHEMERAL_POD_REAL_WRITE_RAW_OUTPUT_PATH";
const REPORT_PATH = String(process.env.AVANTIQO_CODE_EPHEMERAL_POD_REAL_WRITE_REPORT_PATH || "artifacts/avantiqo-code-ephemeral-pod-real-write-proof-v1.json").trim();
const MODULE_NAME = "invoice-total.mjs";
const TEST_NAME = "invoice-total.test.mjs";

const BROKEN_SOURCE = `export function invoiceTotal(subtotal, taxRate) {
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
console.log("AVANTIQO_CODE_REAL_WRITE_TEST_PASS");
`;

const text = (value) => String(value ?? "").trim();
const sha256 = (value) => crypto.createHash("sha256").update(String(value), "utf8").digest("hex");

if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

function parseGeneratedFile(raw) {
  let candidate = text(raw).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`${CONTRACT}_GENERATED_JSON_REQUIRED`);
  let parsed;
  try { parsed = JSON.parse(candidate.slice(start, end + 1)); }
  catch (error) { throw new Error(`${CONTRACT}_GENERATED_JSON_INVALID:${text(error?.message)}`); }
  if (!parsed || Object.keys(parsed).sort().join(",") !== "content,path") {
    throw new Error(`${CONTRACT}_GENERATED_JSON_SHAPE_INVALID`);
  }
  if (text(parsed.path) !== MODULE_NAME) throw new Error(`${CONTRACT}_GENERATED_PATH_INVALID:${text(parsed.path)}`);
  const content = String(parsed.content ?? "");
  if (!content.trim() || content.length > 12_000 || content === BROKEN_SOURCE) {
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

function runFixture(cwd) {
  return spawnSync(process.execPath, ["--permission", `--allow-fs-read=${cwd}`, TEST_NAME], {
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
}

const realInstruction = [
  "Debug the supplied JavaScript module so every immutable assertion passes.",
  `Return ONLY strict JSON exactly shaped {\"path\":\"${MODULE_NAME}\",\"content\":\"<complete UTF-8 source file>\"}.`,
  "No markdown and no commentary outside the JSON object.",
  `Modify only ${MODULE_NAME}; ${TEST_NAME} is immutable executable specification.`,
  "The generated module must be self-contained with no imports, environment access, filesystem, child process, network, or dynamic code evaluation.",
  "Keep the public export invoiceTotal.",
].join(" ");

const rawOutputPath = path.join(os.tmpdir(), `avantiqo-code-real-write-output-${crypto.randomUUID()}.json`);
const transformedPath = path.join(process.cwd(), `.tmp-avantiqo-code-real-write-v3-${process.pid}-${Date.now()}.mjs`);
let workspace = "";
let report = null;

try {
  const baseSource = readFileSync(BASE_V3_PATH, "utf8");
  const submitMarker = '  const submitResponse = await nativeFetch(`${baseUrl}${health.async_submit_path}`, {\n    ...(init || {}),\n    method: "POST",\n  });';
  const submitReplacement = `  const realWriteSubmitInit = { ...(init || {}) };\n  let realWritePayload = null;\n  try { realWritePayload = JSON.parse(String(realWriteSubmitInit.body || "{}")); } catch { realWritePayload = null; }\n  if (!realWritePayload?.input) throw new Error("${CONTRACT}_BASE_PAYLOAD_INVALID");\n  realWritePayload.input.capability = "ai.code.debug";\n  realWritePayload.input.instruction = ${JSON.stringify(realInstruction)};\n  realWritePayload.input.structured_specification = {\n    certification_contract: ${JSON.stringify(CONTRACT)},\n    real_source_write_required: true,\n    files: [\n      { path: ${JSON.stringify(MODULE_NAME)}, content: ${JSON.stringify(BROKEN_SOURCE)}, editable: true },\n      { path: ${JSON.stringify(TEST_NAME)}, content: ${JSON.stringify(TEST_SOURCE)}, editable: false },\n    ],\n    output_contract: { format: "strict-json", path: ${JSON.stringify(MODULE_NAME)}, complete_file_content_required: true },\n    raw_reasoning_must_not_persist: true,\n  };\n  realWriteSubmitInit.body = JSON.stringify(realWritePayload);\n  const submitResponse = await nativeFetch(\`${'${baseUrl}${health.async_submit_path}'}\`, {\n    ...realWriteSubmitInit,\n    method: "POST",\n  });`;

  const successMarker = '      asyncSucceeded = true;\n      return jsonResponse({\n        success: true,\n        contract: POD_HTTP_CONTRACT,\n        transport: "pod-http",\n        output: pollBody.output,\n      });';
  const successReplacement = `      asyncSucceeded = true;\n      const realWriteRawOutputPath = text(process.env.${RAW_OUTPUT_ENV});\n      if (!realWriteRawOutputPath) throw new Error(${JSON.stringify(`${CONTRACT}_RAW_OUTPUT_PATH_REQUIRED`)});\n      writeFileSync(realWriteRawOutputPath, JSON.stringify(pollBody.output, null, 2), "utf8");\n      return jsonResponse({\n        success: true,\n        contract: POD_HTTP_CONTRACT,\n        transport: "pod-http",\n        output: { ...pollBody.output, result: "AVANTIQO_CODE_POD_GENERATION_OK" },\n      });`;

  if (!baseSource.includes(submitMarker)) throw new Error(`${CONTRACT}_BASE_V3_SUBMIT_MARKER_MISSING`);
  if (!baseSource.includes(successMarker)) throw new Error(`${CONTRACT}_BASE_V3_SUCCESS_MARKER_MISSING`);
  const transformed = baseSource.replace(submitMarker, submitReplacement).replace(successMarker, successReplacement);
  writeFileSync(transformedPath, transformed, "utf8");

  process.env[BASE_APPROVAL_ENV] = "YES";
  process.env[RAW_OUTPUT_ENV] = rawOutputPath;
  await import(`${pathToFileURL(transformedPath).href}?v=${Date.now()}`);

  const rawOutput = JSON.parse(readFileSync(rawOutputPath, "utf8"));
  if (text(rawOutput?.provider) !== "avantiqo-code") throw new Error(`${CONTRACT}_PROVIDER_INVALID:${text(rawOutput?.provider)}`);
  if (text(rawOutput?.engine_contract) !== "AVANTIQO_CODE_ENGINE_V1") throw new Error(`${CONTRACT}_ENGINE_CONTRACT_INVALID`);
  if (text(rawOutput?.capability) !== "ai.code.debug") throw new Error(`${CONTRACT}_CAPABILITY_INVALID:${text(rawOutput?.capability)}`);
  if (rawOutput?.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_POLICY_INVALID`);
  if (!(Number(rawOutput?.usage?.input_tokens) > 0) || !(Number(rawOutput?.usage?.output_tokens) > 0)) {
    throw new Error(`${CONTRACT}_TOKEN_USAGE_REQUIRED`);
  }

  const generated = parseGeneratedFile(rawOutput?.result);
  workspace = mkdtempSync(path.join(os.tmpdir(), "avantiqo-code-real-write-exec-"));
  writeFileSync(path.join(workspace, MODULE_NAME), BROKEN_SOURCE, "utf8");
  writeFileSync(path.join(workspace, TEST_NAME), TEST_SOURCE, "utf8");
  const initial = runFixture(workspace);
  if (initial.status === 0) throw new Error(`${CONTRACT}_BROKEN_FIXTURE_MUST_FAIL_BEFORE_AI`);
  writeFileSync(path.join(workspace, MODULE_NAME), generated, "utf8");
  const final = runFixture(workspace);
  if (final.status !== 0) {
    throw new Error(`${CONTRACT}_GENERATED_TEST_FAILED:${String(final.stderr || final.stdout || "").slice(0, 1200)}`);
  }

  report = {
    success: true,
    contract: CONTRACT,
    generated_file: {
      path: MODULE_NAME,
      content: generated,
      sha256: sha256(generated),
      bytes: Buffer.byteLength(generated, "utf8"),
    },
    proof: {
      proven_ephemeral_pod_v3_path_reused: true,
      model_inference_performed: true,
      real_source_write_required: true,
      broken_fixture_failed_before_ai: true,
      generated_code_executed: true,
      generated_tests_passed: true,
      immutable_test_file_modified: false,
      raw_reasoning_persisted: false,
      provider: rawOutput.provider,
      foundation_model: rawOutput.foundation_model,
      runtime_model: rawOutput.runtime_model,
      serving_runtime: rawOutput.serving_runtime,
      quantization: rawOutput.quantization,
      usage: rawOutput.usage,
      generation_seconds: rawOutput.generation_seconds,
    },
    safeguards: {
      persistent_repository_mutation_by_generated_code: false,
      generated_code_network_permission: false,
      generated_code_child_process_permission: false,
      generated_code_environment_inheritance: false,
      production_deploy_performed: false,
      secrets_printed: false,
    },
  };

  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_EPHEMERAL_POD_REAL_WRITE_PASS",
    generated_source_sha256: report.generated_file.sha256,
    generated_source_bytes: report.generated_file.bytes,
    generated_code_executed: true,
    generated_tests_passed: true,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  console.log(`${CONTRACT}=PASS`);
} finally {
  delete process.env[RAW_OUTPUT_ENV];
  try { unlinkSync(rawOutputPath); } catch {}
  try { unlinkSync(transformedPath); } catch {}
  if (workspace) rmSync(workspace, { recursive: true, force: true });
}

if (!report?.success) throw new Error(`${CONTRACT}_FINAL_STATE_INVALID`);
