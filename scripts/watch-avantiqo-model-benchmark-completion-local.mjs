import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_MODEL_BENCHMARK_COMPLETION_WATCH_V1";
const RUN_SCOPE = "platform_model_benchmark_runs";
const ACTIVE = new Set(["BENCHMARK_SUBMITTED", "BENCHMARK_RUNNING"]);
const TERMINAL = new Set(["BENCHMARK_COMPLETED", "BENCHMARK_FAILED", "BENCHMARK_STALE"]);
const DEFAULT_POLL_MS = 10000;
const DEFAULT_MAX_POLLS = 720;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}
function bounded(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shell(name, args, label) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${label}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 1200);
}
function validateMain() {
  shell("git", ["fetch", "origin", "main"], "BENCHMARK_WATCH_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "BENCHMARK_WATCH_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`BENCHMARK_WATCH_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "BENCHMARK_WATCH_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "BENCHMARK_WATCH_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`BENCHMARK_WATCH_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

if (!yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_WATCH_DEVELOPMENT_ENV_REQUIRED");
}
const mainCommit = validateMain();
const pollMs = bounded(process.env.AVANTIQO_MODEL_BENCHMARK_WATCH_POLL_INTERVAL_MS, DEFAULT_POLL_MS, 2000, 60000);
const maxPolls = bounded(process.env.AVANTIQO_MODEL_BENCHMARK_WATCH_MAX_POLLS, DEFAULT_MAX_POLLS, 1, 2000);

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { ensureAvantiqoLearningOrganizationEnvironment } = await import("@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime");
const { refreshAvantiqoModelBenchmark } = await import("@/lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime");
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
const rows = Array.isArray(rowsResult.data) ? rowsResult.data : [];
const activeRows = rows.filter((row) => ACTIVE.has(text(object(row.metadata).status, 80)));
if (activeRows.length > 1) {
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_WATCH_ACTIVE_RUN_AMBIGUOUS:${activeRows.length}`);
}
const row = activeRows[0] || rows.find((item) => TERMINAL.has(text(object(item.metadata).status, 80))) || null;
if (!row) throw new Error("AVANTIQO_MODEL_BENCHMARK_WATCH_RUN_NOT_FOUND");

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_BENCHMARK_WATCH_STARTED",
  main_commit: mainCommit,
  benchmark_run_subject: text(row.subject, 240),
  benchmark_run_status: text(object(row.metadata).status, 80),
  poll_interval_ms: pollMs,
  max_polls: maxPolls,
  provider_jobs_submitted_by_this_process: 0,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

function printTerminal(result) {
  const evaluation = object(result?.evaluation);
  const baseline = object(evaluation.baseline);
  const candidate = object(evaluation.candidate);
  const review = object(result?.candidate_review);
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: result?.status === "BENCHMARK_COMPLETED"
      ? "AVANTIQO_MODEL_BENCHMARK_COMPLETED"
      : result?.status === "BENCHMARK_STALE"
        ? "AVANTIQO_MODEL_BENCHMARK_STALE"
        : "AVANTIQO_MODEL_BENCHMARK_FAILED",
    success: result?.status === "BENCHMARK_COMPLETED",
    status: result?.status || null,
    judged_case_count: Number(evaluation.judged_case_count || 0),
    regression_count: Number(evaluation.regression_count || 0),
    baseline_pass_rate: Number(baseline.pass_rate || 0),
    candidate_pass_rate: Number(candidate.pass_rate || 0),
    baseline_quality_score: Number(baseline.quality_score || 0),
    candidate_quality_score: Number(candidate.quality_score || 0),
    quality_delta: Number(((Number(candidate.quality_score || 0)) - (Number(baseline.quality_score || 0))).toFixed(4)),
    candidate_hallucination_score: Number(candidate.hallucination_score || 0),
    governance_passed: candidate.governance_passed === true,
    privacy_passed: candidate.privacy_passed === true,
    tool_use_passed: candidate.tool_use_passed === true,
    authorization_passed: candidate.authorization_passed === true,
    leakage_detected: candidate.leakage_detected === true,
    critical_case_failure_count: Number(candidate.critical_case_failure_count || 0),
    candidate_review_status: review.status || result?.run?.metadata?.candidate_review_status || null,
    model_candidate_id: result?.run?.metadata?.model_candidate_id || review?.candidate?.id || null,
    provider_jobs_submitted_by_this_process: 0,
    production_model_promoted: false,
    production_model_promotion_effect: "NONE",
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
}

let status = text(object(row.metadata).status, 80);
if (TERMINAL.has(status)) {
  printTerminal({ status, run: row, evaluation: object(row.metadata).evaluation });
  if (status !== "BENCHMARK_COMPLETED") process.exitCode = 1;
} else {
  let completed = false;
  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const result = await refreshAvantiqoModelBenchmark({ benchmarkRunId: row.id });
    const next = text(result?.status, 80);
    if (poll === 1 || poll % 6 === 0 || next !== status) {
      console.log(JSON.stringify({
        contract: CONTRACT,
        event: "AVANTIQO_MODEL_BENCHMARK_WATCH_PROGRESS",
        poll,
        status: next,
        baseline_status: result?.run?.metadata?.baseline_status || null,
        candidate_status: result?.run?.metadata?.candidate_status || null,
        provider_jobs_submitted_by_this_process: 0,
        production_model_promoted: false,
        production_deploy_performed: false,
        secrets_printed: false,
      }, null, 2));
    }
    status = next;
    if (TERMINAL.has(status)) {
      printTerminal(result);
      completed = true;
      if (status !== "BENCHMARK_COMPLETED") process.exitCode = 1;
      break;
    }
    if (!ACTIVE.has(status)) throw new Error(`AVANTIQO_MODEL_BENCHMARK_WATCH_UNEXPECTED_STATUS:${status || "UNKNOWN"}`);
    if (poll < maxPolls) await sleep(pollMs);
  }
  if (!completed && !process.exitCode) {
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_MODEL_BENCHMARK_WATCH_LIMIT_REACHED",
      success: false,
      status,
      provider_jobs_submitted_by_this_process: 0,
      production_model_promoted: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
    process.exitCode = 2;
  }
}

if (!process.exitCode) {
  console.log("AVANTIQO_MODEL_BENCHMARK_WATCH=TERMINAL_STATE_RECORDED");
  console.log("AVANTIQO_MODEL_BENCHMARK_WATCH_PRODUCTION_PROMOTION=NO");
  console.log("AVANTIQO_MODEL_BENCHMARK_WATCH_SECRETS_PRINTED=NO");
}
