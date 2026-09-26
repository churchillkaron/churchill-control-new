import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_FRONTIER_LOCAL_RUNNER_V1";
const SUITE_CONTRACT = "AVANTIQO_CODE_FRONTIER_ENGINEERING_SUITE_V1";
const PROMPT_CONTRACT = "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1";
const DEFAULT_SUITE = "benchmarks/avantiqo-code-frontier-engineering-suite.json";
const DEFAULT_PROMPT = "benchmarks/avantiqo-code-frontier-prompt-contract.json";
const DEFAULT_OUTPUT = "/tmp/avantiqo-code-frontier-owned-local.json";
const APPROVAL = "AVANTIQO_CODE_FRONTIER_LOCAL_APPROVED";

const text = (value, maximum = 12000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const sha256 = (value) => createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}
function hasArg(name) {
  return process.argv.includes(name);
}
function shell(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${CONTRACT}_COMMAND_FAILED:${command}:${args.join(" ")}:${text(result.stderr || result.stdout, 800)}`);
  return text(result.stdout);
}
function provenance({ requireCleanMain }) {
  const head = shell("git", ["rev-parse", "HEAD"]);
  const branch = shell("git", ["branch", "--show-current"]);
  const remote = shell("git", ["rev-parse", "origin/main"]);
  const dirty = shell("git", ["status", "--porcelain"]);
  const currentMain = branch === "main" && head === remote;
  const clean = !dirty;
  if (requireCleanMain && !currentMain) throw new Error(`${CONTRACT}_CURRENT_MAIN_REQUIRED`);
  if (requireCleanMain && !clean) throw new Error(`${CONTRACT}_CLEAN_REPOSITORY_REQUIRED`);
  return { source_commit: head, ref: branch || null, origin_main: remote, current_main: currentMain, repository_clean: clean };
}
function tokenMetric(metrics, names) {
  for (const name of names) {
    const value = Number(metrics?.[name]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

const dryRun = hasArg("--dry-run");
const limitArg = Number(argValue("--limit", "0"));
const outputPath = resolve(argValue("--output", DEFAULT_OUTPUT));
const suitePath = resolve(argValue("--suite", DEFAULT_SUITE));
const promptPath = resolve(argValue("--prompt-contract", DEFAULT_PROMPT));
const suiteSource = await readFile(suitePath, "utf8");
const promptSource = await readFile(promptPath, "utf8");
const suite = JSON.parse(suiteSource);
const promptContract = JSON.parse(promptSource);
if (text(suite.contract, 180) !== SUITE_CONTRACT) throw new Error(`${CONTRACT}_SUITE_CONTRACT_INVALID`);
if (text(promptContract.contract, 180) !== PROMPT_CONTRACT) throw new Error(`${CONTRACT}_PROMPT_CONTRACT_INVALID`);
const allCases = list(suite.cases);
if (allCases.length < 20) throw new Error(`${CONTRACT}_MINIMUM_20_CASES_REQUIRED`);
const ids = allCases.map((item) => text(item?.case_id, 240)).filter(Boolean);
if (ids.length !== allCases.length || new Set(ids).size !== ids.length) throw new Error(`${CONTRACT}_CASE_IDS_INVALID`);
const selectedCases = limitArg > 0 ? allCases.slice(0, Math.min(limitArg, allCases.length)) : allCases;

const { renderCodeAIFrontierBenchmarkPrompt } = await import("../lib/code/runtime/CodeAIFrontierBenchmarkPromptRuntime.js");
const { gradeCodeAICompetitiveReferenceCase } = await import("../lib/code/runtime/CodeAICompetitiveReferenceLiveRunnerRuntime.js");
const { AvantiqoCodeLocalQueueProvider } = await import("../lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js");
const { resolveAvantiqoLearningOrganization } = await import("../lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime.js");
const { certifyCodeAIFrontierLatency } = await import("../lib/code/runtime/CodeAIFrontierLatencyCertificationRuntime.js");
const { attestCodeAICompetitiveOwnedReport } = await import("../lib/code/runtime/CodeAICompetitiveOwnedAttestationRuntime.js");

const prompts = selectedCases.map((benchmarkCase) => ({
  case: benchmarkCase,
  prompt: renderCodeAIFrontierBenchmarkPrompt({ prompt_contract: promptContract, benchmark_case: benchmarkCase }),
}));
if (prompts.some((entry) => !entry.prompt || entry.prompt.length < 80)) throw new Error(`${CONTRACT}_PROMPT_RENDER_INVALID`);

const providerAvailable = await AvantiqoCodeLocalQueueProvider.available();
const source = provenance({ requireCleanMain: !dryRun });
const suiteSha = sha256(suiteSource);
const promptSha = sha256(promptSource);

if (dryRun) {
  const report = {
    success: providerAvailable,
    contract: CONTRACT,
    mode: "DRY_RUN",
    suite_contract: SUITE_CONTRACT,
    suite_sha256: suiteSha,
    prompt_contract: PROMPT_CONTRACT,
    prompt_contract_sha256: promptSha,
    selected_case_count: selectedCases.length,
    full_suite_case_count: allCases.length,
    prompt_render_verified: true,
    provider_available: providerAvailable,
    provider: "avantiqo-code",
    infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
    local_owned_only: true,
    external_provider_execution_performed: false,
    local_compute_job_submitted: false,
    provenance: source,
    production_deploy_performed: false,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!providerAvailable) process.exitCode = 2;
  process.exit();
}

if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_FRONTIER_LOCAL_APPROVED=YES_REQUIRED");
}
if (!providerAvailable) throw new Error(`${CONTRACT}_LOCAL_PROVIDER_UNAVAILABLE`);
const fullSuiteRun = selectedCases.length === allCases.length;
const ownedComputeUsdPerHour = Number(process.env.AVANTIQO_CODE_OWNED_COMPUTE_USD_PER_HOUR);
if (fullSuiteRun && !(Number.isFinite(ownedComputeUsdPerHour) && ownedComputeUsdPerHour > 0)) {
  throw new Error("AVANTIQO_CODE_OWNED_COMPUTE_USD_PER_HOUR_REQUIRED");
}
const resolvedOrganization = await resolveAvantiqoLearningOrganization({ allowDatabaseFallback: true });
const organizationId = text(resolvedOrganization?.organization_id, 160);
if (!organizationId) throw new Error(`${CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);

const observations = [];
for (const entry of prompts) {
  const caseId = text(entry.case.case_id, 240);
  const usageId = `frontier-local:${caseId}:${Date.now()}:${sha256(entry.prompt).slice(0, 12)}`;
  const startedAt = performance.now();
  const submitted = await AvantiqoCodeLocalQueueProvider.execute({
    capability: "ai.code.review",
    instruction: entry.prompt,
    response_format: { type: "json_object" },
    max_output_tokens: 4096,
    temperature: 0.1,
    context: { organization_id: organizationId, usage_id: usageId },
    metadata: {
      benchmark_only: true,
      benchmark_contract: CONTRACT,
      suite_contract: SUITE_CONTRACT,
      suite_sha256: suiteSha,
      prompt_contract: PROMPT_CONTRACT,
      prompt_contract_sha256: promptSha,
      case_id: caseId,
      external_fallback_allowed: false,
      production_routing_allowed: false,
    },
  });
  const providerJobId = text(submitted?.output?.provider_job_id, 300);
  if (!providerJobId) throw new Error(`${CONTRACT}_PROVIDER_JOB_REQUIRED:${caseId}`);
  let settled = null;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    settled = await AvantiqoCodeLocalQueueProvider.getStatus({ job_id: providerJobId });
    if (["completed", "failed"].includes(text(settled?.status).toLowerCase())) break;
    await sleep(100);
  }
  const wallMs = Number(Math.max(0, performance.now() - startedAt).toFixed(3));
  if (text(settled?.status).toLowerCase() !== "completed") {
    observations.push({
      case_id: caseId,
      category: text(entry.case.category, 160) || null,
      passed: false,
      failures: [text(settled?.error, 500) || "LOCAL_PROVIDER_TIMEOUT"],
      wall_ms: wallMs,
      latency_measurement_source: "RUNNER_MONOTONIC_CLOCK_V1",
      provider_job_id: providerJobId,
      raw_reasoning_persisted: false,
    });
    continue;
  }
  const output = object(settled.output);
  const raw = text(output.result, 30000);
  const grade = gradeCodeAICompetitiveReferenceCase(entry.case, raw);
  const metrics = object(output.metrics);
  const inferenceElapsedMs = tokenMetric(metrics, ["elapsed_ms"]);
  const supplierCostUsd =
    inferenceElapsedMs !== null && Number.isFinite(ownedComputeUsdPerHour) && ownedComputeUsdPerHour > 0
      ? Number(((inferenceElapsedMs / 3_600_000) * ownedComputeUsdPerHour).toFixed(8))
      : null;
  observations.push({
    case_id: caseId,
    category: text(entry.case.category, 160) || null,
    passed: grade.passed,
    failures: grade.failures,
    quality_score: Number(grade.quality_score || 0),
    evidence_grounding_score: Number(grade.evidence_grounding_score || 0),
    narrative_grounding_score: Number(grade.narrative_grounding_score || 0),
    evidence_distinctness_score: Number(grade.evidence_distinctness_score || 0),
    response_template_fingerprint_sha256: String(grade.response_template_fingerprint_sha256 || "").slice(0, 80) || null,
    evidence_key_count: Number(grade.evidence_key_count || 0),
    wall_ms: wallMs,
    latency_measurement_source: "RUNNER_MONOTONIC_CLOCK_V1",
    input_tokens: tokenMetric(metrics, ["input_tokens", "prompt_tokens", "prompt_eval_count"]),
    output_tokens: tokenMetric(metrics, ["output_tokens", "completion_tokens", "eval_count"]),
    inference_elapsed_ms: inferenceElapsedMs,
    owned_compute_usd_per_hour: Number.isFinite(ownedComputeUsdPerHour) && ownedComputeUsdPerHour > 0 ? ownedComputeUsdPerHour : null,
    owned_compute_rate_source: Number.isFinite(ownedComputeUsdPerHour) && ownedComputeUsdPerHour > 0
      ? "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1"
      : null,
    cost_measurement_source: supplierCostUsd !== null ? "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1" : null,
    supplier_cost_usd: supplierCostUsd,
    model_total_duration_ms: tokenMetric(metrics, ["total_duration_ns"]) !== null
      ? Math.round(tokenMetric(metrics, ["total_duration_ns"]) / 1e6)
      : null,
    model_load_duration_ms: tokenMetric(metrics, ["load_duration_ns"]) !== null
      ? Math.round(tokenMetric(metrics, ["load_duration_ns"]) / 1e6)
      : null,
    code_gpu_wait_ms: tokenMetric(metrics, ["code_gpu_wait_ms"]),
    code_gpu_reclaim_wait_ms: tokenMetric(metrics, ["code_gpu_reclaim_wait_ms"]),
    code_gpu_reclaim_attempted: metrics.code_gpu_reclaim_attempted === true,
    code_gpu_released_model_count: tokenMetric(metrics, ["code_gpu_released_model_count"]),
    code_cpu_fallback: metrics.code_cpu_fallback === true,
    code_runtime_model_already_gpu_resident: metrics.code_runtime_model_already_gpu_resident === true,
    provider_job_id: providerJobId,
    provider: text(output.provider, 120) || "avantiqo-code",
    model: text(output.model, 160) || "avantiqo-code-v1",
    runtime_model: text(output.runtime_model, 200) || null,
    node_id: text(output.node_id, 200) || null,
    infrastructure_provider: text(output.infrastructure_provider, 160) || "AVANTIQO_LOCAL_NODE_V1",
    raw_output_persisted: false,
    raw_reasoning_persisted: false,
  });
  console.log("AVANTIQO_CODE_FRONTIER_LOCAL_CASE=" + JSON.stringify(observations.at(-1)));
}

const passedCount = observations.filter((item) => item.passed).length;
const latencyCertification = certifyCodeAIFrontierLatency(observations, {
  warm_p50_limit_ms: process.env.AVANTIQO_CODE_FRONTIER_WARM_P50_LIMIT_MS,
  warm_p95_limit_ms: process.env.AVANTIQO_CODE_FRONTIER_WARM_P95_LIMIT_MS,
  cold_start_limit_ms: process.env.AVANTIQO_CODE_FRONTIER_COLD_START_LIMIT_MS,
  minimum_warm_samples: process.env.AVANTIQO_CODE_FRONTIER_MINIMUM_WARM_SAMPLES,
});
const correctnessPassed = passedCount === observations.length;
const costedObservations = observations.filter((item) => Number.isFinite(Number(item.supplier_cost_usd)) && Number(item.supplier_cost_usd) >= 0);
const totalSupplierCostUsd = costedObservations.length === observations.length
  ? Number(costedObservations.reduce((sum, item) => sum + Number(item.supplier_cost_usd), 0).toFixed(8))
  : null;
const report = {
  contract: CONTRACT,
  benchmark_run_id: randomUUID(),
  generated_at: new Date().toISOString(),
  measurement_mode: "LIVE_OWNED_LOCAL_NODE",
  suite_contract: SUITE_CONTRACT,
  suite_sha256: suiteSha,
  prompt_contract: PROMPT_CONTRACT,
  prompt_contract_sha256: promptSha,
  model: { provider: "avantiqo-code", product_model: "avantiqo-code-v1" },
  runner_source_commit: source.source_commit,
  runner_ref: "main",
  runner_repository_clean: source.repository_clean,
  organization_scope: "AVANTIQO_PLATFORM_LEARNING",
  infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
  local_owned_only: true,
  external_fallback_allowed: false,
  external_provider_execution_performed: false,
  raw_model_output_persisted: false,
  raw_reasoning_persisted: false,
  economics: {
    estimated_supplier_cost_usd: totalSupplierCostUsd,
    cost_measurement_source: totalSupplierCostUsd !== null ? "RUNNER_RECOMPUTED_FROM_WORKER_ELAPSED_V1" : null,
    owned_compute_usd_per_hour: Number.isFinite(ownedComputeUsdPerHour) && ownedComputeUsdPerHour > 0 ? ownedComputeUsdPerHour : null,
    owned_compute_rate_source: Number.isFinite(ownedComputeUsdPerHour) && ownedComputeUsdPerHour > 0
      ? "OPERATOR_APPROVED_LOCAL_COMPUTE_RATE_V1"
      : null,
  },
  observations,
  summary: {
    requested_cases: selectedCases.length,
    completed_runs: observations.length,
    passed_cases: passedCount,
    pass_rate: observations.length ? Number((passedCount / observations.length).toFixed(4)) : 0,
    correctness_passed: correctnessPassed,
    latency_certification: latencyCertification,
    passed: correctnessPassed && latencyCertification.passed,
    complete_suite: selectedCases.length === allCases.length && observations.length === allCases.length,
  },
  production_deploy_performed: false,
};
const deliverable = report.summary.complete_suite
  ? attestCodeAICompetitiveOwnedReport(report, { env: process.env })
  : { ...report, owned_attestation_status: "NOT_ELIGIBLE_PARTIAL_SUITE" };
await writeFile(outputPath, JSON.stringify(deliverable, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  success: report.summary.passed,
  contract: CONTRACT,
  output_path: outputPath,
  summary: report.summary,
  owned_attestation_contract: deliverable?.owned_attestation?.contract || null,
}, null, 2));
if (!report.summary.passed) process.exitCode = 2;
