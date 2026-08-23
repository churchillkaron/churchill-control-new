import { executeCodeAIMission } from "../lib/code/runtime/CodeAIMissionRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_REPAIR_LIVE_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const FIXTURE = "tests/fixtures/code-ai-autonomous-repair/invoice-total.mjs";
const VERIFIER = "scripts/code-ai-autonomous-repair-fixture-test.mjs";
const REPOSITORY = process.env.AVANTIQO_CODE_SANDBOX_REPOSITORY || "https://github.com/churchillkaron/churchill-control-new";
const REF = process.env.AVANTIQO_CODE_SANDBOX_REF || "main";
const ENDPOINT = String(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID || "").trim();
const API_KEY = String(process.env.RUNPOD_API_KEY || "").trim();
const API_BASE = "https://api.runpod.ai/v2";

if (!ENDPOINT) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
if (!API_KEY) throw new Error("RUNPOD_API_KEY_REQUIRED");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanJson(value) {
  const raw = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_JSON_REQUIRED");
  return JSON.parse(raw.slice(start, end + 1));
}

async function runOwnedRepairPlanner({ fileContent, failure }) {
  const submit = await fetch(`${API_BASE}/${ENDPOINT}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.code.debug",
        foundation_model: FOUNDATION_MODEL,
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `code-autonomous-repair-cert-${Date.now()}`,
        instruction: [
          "Return exactly one JSON object and no markdown.",
          "You are repairing a real failing repository fixture from observed evidence.",
          `Path: ${FIXTURE}`,
          "Observed complete file content:",
          fileContent,
          "Observed verifier failure:",
          JSON.stringify(failure),
          `The verifier is: node ${VERIFIER}`,
          "Diagnose the bug and return the complete corrected file content.",
          `Required JSON shape: {\"path\":\"${FIXTURE}\",\"content\":\"complete corrected file content\",\"diagnosis\":\"concise observed diagnosis\"}`,
          "Do not modify any other file. Do not expose chain-of-thought.",
        ].join("\n\n"),
        structured_specification: {
          certification_contract: CONTRACT,
          target_file: FIXTURE,
          verifier: VERIFIER,
          allowed_files: [FIXTURE],
          response_style: "strict_json",
        },
      },
    }),
  });
  const submitted = await submit.json().catch(() => ({}));
  if (!submit.ok) throw new Error(`RUNPOD_SUBMIT_HTTP_${submit.status}:${submitted?.error || submitted?.message || ""}`);
  const jobId = String(submitted?.id || "").trim();
  if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");

  const timeoutMs = Math.max(60_000, Math.min(20 * 60_000, Number(process.env.AVANTIQO_CODE_AUTONOMOUS_CERT_TIMEOUT_MS || 15 * 60_000)));
  const deadline = Date.now() + timeoutMs;
  let body = submitted;
  while (Date.now() < deadline) {
    const status = String(body?.status || "").toUpperCase();
    if (status === "COMPLETED") break;
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
      throw new Error(`RUNPOD_JOB_${status}:${body?.error || body?.message || ""}`);
    }
    await delay(2000);
    const response = await fetch(`${API_BASE}/${ENDPOINT}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
    });
    body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`RUNPOD_STATUS_HTTP_${response.status}`);
  }
  if (String(body?.status || "").toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_JOB_TIMEOUT:${jobId}`);
  }

  const output = body.output || {};
  if (String(output.provider || "") !== "avantiqo-code") throw new Error("CODE_AI_AUTONOMOUS_REPAIR_PROVIDER_MISMATCH");
  if (String(output.engine_contract || "") !== ENGINE_CONTRACT) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_ENGINE_CONTRACT_MISMATCH");
  if (String(output.foundation_model || "") !== FOUNDATION_MODEL) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_MODEL_MISMATCH");
  if (String(output.runtime_model || "") !== RUNTIME_MODEL) {
    throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_RUNTIME_MODEL_MISMATCH:${output.runtime_model || "missing"}`);
  }
  if (String(output.quantization || "").toLowerCase() !== EXPECTED_QUANTIZATION) {
    throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_QUANTIZATION_MISMATCH:${output.quantization || "missing"}`);
  }
  if (String(output.serving_runtime || "").toLowerCase() !== EXPECTED_SERVING_RUNTIME) {
    throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_SERVING_RUNTIME_MISMATCH:${output.serving_runtime || "missing"}`);
  }
  const repair = cleanJson(output.result);
  if (repair.path !== FIXTURE) throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_PATH_INVALID:${repair.path || "missing"}`);
  if (!String(repair.content || "").trim()) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_CONTENT_REQUIRED");
  return { jobId, output, repair };
}

const objective = "Observe the intentionally broken invoice-total certification fixture, diagnose the real verifier failure, repair only that fixture in an isolated Vercel Sandbox, verify the repair, and produce an evidence-backed diff without mutating GitHub main.";

const observed = await executeCodeAIMission({
  objective,
  repository_url: REPOSITORY,
  ref: REF,
  operations: [
    { id: "cert_inspect", action: "inspect", description: "Establish repository baseline.", input: {} },
    { id: "cert_read_fixture", action: "read", description: "Read the complete broken certification fixture.", input: { file_path: FIXTURE, start_line: 1, end_line: 200 } },
    { id: "cert_observe_failure", action: "verify", description: "Observe the real failing verifier before any repair.", input: { command: "node", args: [VERIFIER], cwd: "." } },
  ],
});

if (observed.status !== "repair_required") {
  throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_EXPECTED_INITIAL_FAILURE:${observed.status}`);
}
const readEvidence = (observed.state?.evidence || []).find((item) => item?.operation_id === "cert_read_fixture" && item?.action === "read");
const fileContent = String(readEvidence?.result?.content || "");
if (!fileContent) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_READ_EVIDENCE_REQUIRED");
const failure = (observed.state?.failures || []).find((item) => item?.operation_id === "cert_observe_failure");
if (!failure) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_FAILURE_EVIDENCE_REQUIRED");

const planned = await runOwnedRepairPlanner({ fileContent, failure });

const repaired = await executeCodeAIMission({
  objective,
  repository_url: REPOSITORY,
  ref: REF,
  resume_state: observed.state,
  operations: [
    { id: "cert_apply_owned_repair", action: "apply_files", description: "Apply the owned Code model repair to the isolated fixture only.", input: { files: [{ path: FIXTURE, content: planned.repair.content }] } },
    { id: "cert_verify_repair", action: "verify", description: "Run the real verifier after repair.", input: { command: "node", args: [VERIFIER], cwd: "." } },
    { id: "cert_diff_repair", action: "diff", description: "Capture the final evidence-backed repair diff.", input: {} },
  ],
});

if (repaired.status === "replan_required") {
  throw new Error("CODE_AI_AUTONOMOUS_REPAIR_MAIN_MOVED_RETRY_REQUIRED");
}
if (!repaired.success || repaired.status !== "completed") {
  throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_MISSION_FAILED:${repaired.reason || repaired.status}`);
}
const changed = [...new Set(repaired.state?.files_changed || [])];
if (changed.length !== 1 || changed[0] !== FIXTURE) {
  throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_SCOPE_VIOLATION:${changed.join(",")}`);
}
if (!(repaired.state?.verification || []).some((item) => item?.operation_id === "cert_verify_repair" && item?.passed === true)) {
  throw new Error("CODE_AI_AUTONOMOUS_REPAIR_VERIFICATION_EVIDENCE_REQUIRED");
}
if (!String(repaired.state?.patch || "").includes(FIXTURE)) {
  throw new Error("CODE_AI_AUTONOMOUS_REPAIR_DIFF_EVIDENCE_REQUIRED");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: planned.output.provider,
  foundation_model: planned.output.foundation_model,
  runtime_model: planned.output.runtime_model,
  serving_runtime: planned.output.serving_runtime,
  quantization: planned.output.quantization,
  provider_job_id: planned.jobId,
  observed_failure: true,
  diagnosis_present: Boolean(String(planned.repair.diagnosis || "").trim()),
  isolated_repair_applied: true,
  verification_passed: true,
  diff_verified: true,
  changed_files: changed,
  base_commit: repaired.state.base_commit,
  github_main_mutated: false,
  production_deploy_performed: false,
}, null, 2));
