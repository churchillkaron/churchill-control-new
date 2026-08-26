import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_MODEL_BENCHMARK_EXPIRED_RESULT_RECOVERY_V1";
const RUN_SCOPE = "platform_model_benchmark_runs";
const SUITE_SCOPE = "platform_model_benchmark_suites";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const ACTIVE = new Set(["BENCHMARK_SUBMITTED", "BENCHMARK_RUNNING"]);
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_MAX_POLLS = 360;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}
function bounded(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shell(name, args, label) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${label}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 4000);
}
function validateMain() {
  shell("git", ["fetch", "origin", "main"], "BENCHMARK_RECOVERY_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "BENCHMARK_RECOVERY_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`BENCHMARK_RECOVERY_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  let head = shell("git", ["rev-parse", "HEAD"], "BENCHMARK_RECOVERY_GIT_HEAD_FAILED");
  let remote = shell("git", ["rev-parse", "origin/main"], "BENCHMARK_RECOVERY_GIT_REMOTE_FAILED");
  if (head === remote) return head;
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", head, remote], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (ancestry.status !== 0) {
    throw new Error(`BENCHMARK_RECOVERY_MAIN_DIVERGED:head=${head}:origin_main=${remote}`);
  }
  const changed = shell(
    "git",
    ["diff", "--name-only", `${head}..${remote}`],
    "BENCHMARK_RECOVERY_MAIN_DIFF_FAILED",
  ).split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  const protectedPaths = new Set([
    "scripts/recover-avantiqo-model-benchmark-expired-result-local.mjs",
    "lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime.js",
    "services/avantiqo-intelligence-benchmark/handler.py",
  ]);
  const relevant = changed.filter((path) => protectedPaths.has(path));
  if (relevant.length) {
    throw new Error(`BENCHMARK_RECOVERY_RELEVANT_MAIN_MOVEMENT:${relevant.join(",")}`);
  }
  shell("git", ["merge", "--ff-only", "origin/main"], "BENCHMARK_RECOVERY_MAIN_FAST_FORWARD_FAILED");
  head = shell("git", ["rev-parse", "HEAD"], "BENCHMARK_RECOVERY_GIT_HEAD_AFTER_FAST_FORWARD_FAILED");
  remote = shell("git", ["rev-parse", "origin/main"], "BENCHMARK_RECOVERY_GIT_REMOTE_AFTER_FAST_FORWARD_FAILED");
  if (head !== remote) {
    throw new Error(`BENCHMARK_RECOVERY_MAIN_FAST_FORWARD_VERIFY_FAILED:head=${head}:origin_main=${remote}`);
  }
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: "AVANTIQO_MODEL_BENCHMARK_RECOVERY_UNRELATED_MAIN_MOVEMENT_TOLERATED",
    changed_paths: changed,
    main_commit: head,
    provider_jobs_submitted: false,
    endpoint_mutation_performed: false,
    secrets_printed: false,
  }, null, 2));
  return head;
}

if (!yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
  throw new Error("BENCHMARK_RECOVERY_DEVELOPMENT_ENV_REQUIRED");
}
const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID, 240);
const apiKey = text(process.env.RUNPOD_API_KEY, 4000);
if (!endpointId) throw new Error("BENCHMARK_RECOVERY_ENDPOINT_ID_REQUIRED");
if (!apiKey) throw new Error("BENCHMARK_RECOVERY_RUNPOD_API_KEY_REQUIRED");

const mainCommit = validateMain();
const pollMs = bounded(process.env.AVANTIQO_MODEL_BENCHMARK_RECOVERY_POLL_INTERVAL_MS, DEFAULT_POLL_MS, 2000, 60000);
const maxPolls = bounded(process.env.AVANTIQO_MODEL_BENCHMARK_RECOVERY_MAX_POLLS, DEFAULT_MAX_POLLS, 1, 1000);

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { ensureAvantiqoLearningOrganizationEnvironment } = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const organization = await ensureAvantiqoLearningOrganizationEnvironment();

const rowsResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", RUN_SCOPE)
  .eq("active", true)
  .order("updated_at", { ascending: false })
  .limit(10);
if (rowsResult.error) throw rowsResult.error;
const rows = list(rowsResult.data);
const activeRows = rows.filter((row) => ACTIVE.has(text(object(row.metadata).status, 80)));
if (activeRows.length !== 1) {
  throw new Error(`BENCHMARK_RECOVERY_ACTIVE_RUN_RESOLUTION_FAILED:${activeRows.length}`);
}
let run = activeRows[0];
let metadata = object(run.metadata);
const candidateJobId = text(metadata.candidate_provider_job_id, 240);
const suiteId = text(metadata.benchmark_suite_id, 160);
if (!candidateJobId) throw new Error("BENCHMARK_RECOVERY_CANDIDATE_JOB_ID_REQUIRED");
if (!suiteId) throw new Error("BENCHMARK_RECOVERY_SUITE_ID_REQUIRED");

const suiteResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", SUITE_SCOPE)
  .eq("id", suiteId)
  .eq("active", true)
  .maybeSingle();
if (suiteResult.error) throw suiteResult.error;
if (!suiteResult.data) throw new Error("BENCHMARK_RECOVERY_SUITE_NOT_FOUND");
const expectedCaseCount = list(object(suiteResult.data.metadata).cases).length;
if (expectedCaseCount !== 60) {
  throw new Error(`BENCHMARK_RECOVERY_CASE_COUNT_INVALID:${expectedCaseCount}`);
}

async function statusBody(jobId) {
  const response = await fetch(
    `${RUNPOD_API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (response.status === 404) {
    return { status: "expired", body: null, http_status: 404 };
  }
  if (!response.ok) {
    const detail = text(body?.error?.message || body?.error || body?.message?.detail || body?.message || raw, 1000);
    throw new Error(`BENCHMARK_RECOVERY_RUNPOD_STATUS_FAILED:${response.status}:${detail || "UNKNOWN"}`);
  }
  const provider = text(body.status, 80).toUpperCase();
  let status = "processing";
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(provider)) status = "completed";
  else if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(provider)) status = "failed";
  else if (["IN_QUEUE", "QUEUED", "PENDING"].includes(provider)) status = "queued";
  return { status, body, http_status: response.status };
}

function validateCandidate(body) {
  const output = object(body?.output);
  if (text(output.contract, 160) !== "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1") {
    throw new Error("BENCHMARK_RECOVERY_CANDIDATE_CONTRACT_MISMATCH");
  }
  if (text(output.mode, 40).toLowerCase() !== "candidate") {
    throw new Error("BENCHMARK_RECOVERY_CANDIDATE_MODE_MISMATCH");
  }
  if (Number(output.case_count || 0) !== expectedCaseCount) {
    throw new Error(`BENCHMARK_RECOVERY_CANDIDATE_CASE_COUNT_MISMATCH:${Number(output.case_count || 0)}`);
  }
  if (output?.governance?.production_model_mutated !== false || output?.governance?.production_model_promoted !== false) {
    throw new Error("BENCHMARK_RECOVERY_CANDIDATE_GOVERNANCE_INVARIANT_FAILED");
  }
  const outputs = list(output.outputs);
  if (outputs.length !== expectedCaseCount) {
    throw new Error(`BENCHMARK_RECOVERY_CANDIDATE_OUTPUT_COUNT_MISMATCH:${outputs.length}`);
  }
  for (const item of outputs) {
    if (!text(item?.id, 160) || !text(item?.response, 12000)) {
      throw new Error("BENCHMARK_RECOVERY_CANDIDATE_OUTPUT_FIELDS_REQUIRED");
    }
  }
  return {
    contract: text(output.contract, 160),
    mode: "candidate",
    foundation_model: text(output.foundation_model, 300) || null,
    adapter_artifact_reference: text(output.adapter_artifact_reference, 1000) || null,
    case_count: expectedCaseCount,
    outputs,
    generation: object(output.generation),
    governance: object(output.governance),
  };
}

async function persistCandidateCapture(capture) {
  const now = new Date().toISOString();
  const freshResult = await supabaseAdmin
    .from("intelligence_memories")
    .select("id,subject,metadata,updated_at")
    .eq("organization_id", organization.organization_id)
    .eq("memory_scope", RUN_SCOPE)
    .eq("id", run.id)
    .eq("active", true)
    .single();
  if (freshResult.error) throw freshResult.error;
  const fresh = freshResult.data;
  const freshMetadata = object(fresh.metadata);
  if (text(freshMetadata.candidate_provider_job_id, 240) !== candidateJobId) {
    throw new Error("BENCHMARK_RECOVERY_CANDIDATE_JOB_BINDING_CHANGED");
  }
  const nextMetadata = {
    ...freshMetadata,
    status: "BENCHMARK_RECOVERY_REQUIRED",
    baseline_status: text(freshMetadata.baseline_status, 80) || "completed_result_expired",
    baseline_result_missing: true,
    candidate_status: "completed",
    candidate_completed: true,
    candidate_result_capture: {
      contract: "AVANTIQO_MODEL_BENCHMARK_RESULT_CAPTURE_V1",
      provider_job_id: candidateJobId,
      captured_at: now,
      ...capture,
    },
    recovery_required_modes: ["baseline"],
    recovery_reason: "RUNPOD_BASELINE_RESULT_EXPIRED_BEFORE_PERSISTENCE",
    production_model_promotion_effect: "NONE",
    updated_at: now,
  };
  const update = await supabaseAdmin
    .from("intelligence_memories")
    .update({ metadata: nextMetadata, updated_at: now })
    .eq("organization_id", organization.organization_id)
    .eq("memory_scope", RUN_SCOPE)
    .eq("id", run.id)
    .select("id,subject,metadata,updated_at")
    .single();
  if (update.error) throw update.error;
  run = update.data;
  metadata = object(run.metadata);
  return run;
}

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_BENCHMARK_EXPIRED_RESULT_RECOVERY_STARTED",
  main_commit: mainCommit,
  benchmark_run_subject: text(run.subject, 240),
  recorded_baseline_status: text(metadata.baseline_status, 80) || null,
  recorded_candidate_status: text(metadata.candidate_status, 80) || null,
  expected_case_count: expectedCaseCount,
  poll_interval_ms: pollMs,
  max_polls: maxPolls,
  provider_jobs_submitted: false,
  provider_jobs_cancelled: false,
  endpoint_mutation_performed: false,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

let captured = false;
for (let poll = 1; poll <= maxPolls; poll += 1) {
  const candidate = await statusBody(candidateJobId);
  if (poll === 1 || poll % 6 === 0 || candidate.status !== "processing") {
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_MODEL_BENCHMARK_EXPIRED_RESULT_RECOVERY_PROGRESS",
      poll,
      candidate_status: candidate.status,
      provider_jobs_submitted: false,
      endpoint_mutation_performed: false,
      secrets_printed: false,
    }, null, 2));
  }
  if (candidate.status === "failed") {
    throw new Error("BENCHMARK_RECOVERY_CANDIDATE_PROVIDER_JOB_FAILED");
  }
  if (candidate.status === "expired") {
    const now = new Date().toISOString();
    const nextMetadata = {
      ...metadata,
      status: "BENCHMARK_RECOVERY_REQUIRED",
      baseline_result_missing: true,
      candidate_result_missing: true,
      candidate_status: "completed_result_expired",
      recovery_required_modes: ["baseline", "candidate"],
      recovery_reason: "RUNPOD_RESULTS_EXPIRED_BEFORE_PERSISTENCE",
      production_model_promotion_effect: "NONE",
      updated_at: now,
    };
    const update = await supabaseAdmin
      .from("intelligence_memories")
      .update({ metadata: nextMetadata, updated_at: now })
      .eq("organization_id", organization.organization_id)
      .eq("memory_scope", RUN_SCOPE)
      .eq("id", run.id)
      .select("id,subject,metadata,updated_at")
      .single();
    if (update.error) throw update.error;
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_MODEL_BENCHMARK_EXPIRED_RESULT_RECOVERY_OUTPUT_EXPIRED",
      success: false,
      status: "BENCHMARK_RECOVERY_REQUIRED",
      recovery_required_modes: ["baseline", "candidate"],
      provider_jobs_submitted: false,
      endpoint_mutation_performed: false,
      production_model_promoted: false,
      secrets_printed: false,
    }, null, 2));
    process.exitCode = 2;
    break;
  }
  if (candidate.status === "completed") {
    const capture = validateCandidate(candidate.body);
    const saved = await persistCandidateCapture(capture);
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_MODEL_BENCHMARK_CANDIDATE_RESULT_CAPTURED",
      success: true,
      status: text(saved?.metadata?.status, 80),
      candidate_case_count: Number(saved?.metadata?.candidate_result_capture?.case_count || 0),
      candidate_result_persisted: true,
      baseline_result_missing: saved?.metadata?.baseline_result_missing === true,
      recovery_required_modes: list(saved?.metadata?.recovery_required_modes),
      provider_jobs_submitted: false,
      provider_jobs_cancelled: false,
      endpoint_mutation_performed: false,
      production_model_promoted: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
    console.log("AVANTIQO_MODEL_BENCHMARK_EXPIRED_RESULT_RECOVERY=CANDIDATE_CAPTURED");
    captured = true;
    break;
  }
  if (poll < maxPolls) await sleep(pollMs);
}

if (!captured && !process.exitCode) {
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: "AVANTIQO_MODEL_BENCHMARK_EXPIRED_RESULT_RECOVERY_LIMIT_REACHED",
    success: false,
    provider_jobs_submitted: false,
    endpoint_mutation_performed: false,
    production_model_promoted: false,
    secrets_printed: false,
  }, null, 2));
  process.exitCode = 3;
}
