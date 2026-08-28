import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_MODEL_BENCHMARK_READINESS_LOCAL_V1";
const TRAINING_SCOPE = "platform_model_training_jobs";
const BENCHMARK_SUITE_SCOPE = "platform_model_benchmark_suites";
const BENCHMARK_RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINING_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const BENCHMARK_SUITE_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUITE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}

async function loadLocalEnv() {
  let source = "";
  try {
    source = await readFile(".env.local", "utf8");
  } catch {
    return false;
  }
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const name = match[1];
    if (text(process.env[name], 12000)) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
    process.env[name] = value;
  }
  return true;
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
  return text(result.stdout, 1200);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_MODEL_BENCHMARK_READINESS_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_MODEL_BENCHMARK_READINESS_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_MODEL_BENCHMARK_READINESS_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_MODEL_BENCHMARK_READINESS_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_MODEL_BENCHMARK_READINESS_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`AVANTIQO_MODEL_BENCHMARK_READINESS_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

const localEnvLoaded = await loadLocalEnv();
const mainCommit = validateCurrentMain();

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { ensureAvantiqoLearningOrganizationEnvironment } = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const { certifyAvantiqoModelBenchmarkReadiness } = await import(
  "@/lib/intelligence/runtime/AvantiqoModelBenchmarkReadinessRuntime"
);
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const organization = await ensureAvantiqoLearningOrganizationEnvironment();

const trainingResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", TRAINING_SCOPE)
  .eq("active", true)
  .eq("metadata->>contract", TRAINING_CONTRACT)
  .eq("metadata->>foundation_model", FOUNDATION_MODEL)
  .eq("metadata->>status", "TRAINING_COMPLETED")
  .eq("metadata->>requires_candidate_benchmark", "true")
  .order("updated_at", { ascending: false })
  .limit(3);
if (trainingResult.error) throw trainingResult.error;
const trainingJobs = list(trainingResult.data);
if (trainingJobs.length !== 1) {
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_READINESS_TRAINING_JOB_RESOLUTION_FAILED:${trainingJobs.length}`);
}
const trainingJob = trainingJobs[0];
const trainingMetadata = object(trainingJob.metadata);
const adapterArtifactReference = text(trainingMetadata.adapter_artifact_reference, 1000);
if (!adapterArtifactReference.startsWith("/runpod-volume/avantiqo-intelligence-training/")) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_ADAPTER_REFERENCE_INVALID");
}
if (
  trainingMetadata.automatic_model_weight_mutation !== false ||
  trainingMetadata.production_model_promoted === true ||
  text(trainingMetadata.production_model_promotion_effect, 80) !== "NONE"
) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_TRAINING_GOVERNANCE_INVALID");
}

const suiteResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", BENCHMARK_SUITE_SCOPE)
  .eq("active", true)
  .eq("metadata->>contract", BENCHMARK_SUITE_CONTRACT)
  .eq("metadata->>training_job_id", trainingJob.id)
  .order("updated_at", { ascending: false })
  .limit(3);
if (suiteResult.error) throw suiteResult.error;
const suites = list(suiteResult.data);
if (suites.length !== 1) {
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_READINESS_SUITE_RESOLUTION_FAILED:${suites.length}`);
}
const suite = suites[0];

const existingRunResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", BENCHMARK_RUN_SCOPE)
  .eq("active", true)
  .eq("metadata->>training_job_id", trainingJob.id)
  .eq("metadata->>benchmark_suite_id", suite.id)
  .order("updated_at", { ascending: false })
  .limit(10);
if (existingRunResult.error) throw existingRunResult.error;
const existingRuns = list(existingRunResult.data);
if (existingRuns.length) {
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_READINESS_EXISTING_RUN_REQUIRES_RECONCILIATION:${text(object(existingRuns[0].metadata).status, 120) || "UNKNOWN"}`,
  );
}

const readiness = await certifyAvantiqoModelBenchmarkReadiness({
  trainingJobId: trainingJob.id,
  benchmarkSuiteId: suite.id,
});
if (readiness?.status !== "BENCHMARK_ARTIFACTS_CURRENT") {
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_READINESS_NOT_CURRENT:${text(readiness?.status, 120) || "UNKNOWN"}`);
}
if (
  Number(readiness.candidate_count || 0) !== 27 ||
  Number(readiness.example_count || 0) !== 54 ||
  Number(readiness.case_count || 0) !== 60
) {
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_READINESS_COUNTS_INVALID:candidates=${readiness.candidate_count}:examples=${readiness.example_count}:cases=${readiness.case_count}`,
  );
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  main_commit: mainCommit,
  local_env_loaded: localEnvLoaded,
  learning_organization_resolved: Boolean(organization.organization_id),
  learning_organization_source: organization.source,
  training_job: {
    id: trainingJob.id,
    subject: text(trainingJob.subject, 240),
    status: text(trainingMetadata.status, 80),
    adapter_artifact_reference: adapterArtifactReference,
    optimizer_steps: Number(object(trainingMetadata.training_metrics).optimizer_steps || 0),
    method: text(object(trainingMetadata.training_metrics).method, 160) || null,
    base_precision: text(object(trainingMetadata.training_metrics).base_precision, 80) || null,
    moe_adapter_attachment_verified:
      object(trainingMetadata.training_metrics).moe_adapter_attachment_verified === true,
    bf16_gpu_preflight_verified:
      object(trainingMetadata.training_metrics).bf16_gpu_preflight_verified === true,
  },
  benchmark_suite: {
    id: suite.id,
    subject: text(suite.subject, 240),
  },
  readiness: {
    status: readiness.status,
    candidate_count: readiness.candidate_count,
    example_count: readiness.example_count,
    case_count: readiness.case_count,
    dataset_fingerprint: readiness.dataset_fingerprint,
    example_fingerprint: readiness.example_fingerprint,
    suite_fingerprint: readiness.suite_fingerprint,
    current_dataset_binding_verified:
      readiness?.governance?.current_dataset_binding_verified === true,
    current_candidate_source_versions_verified:
      readiness?.governance?.current_candidate_source_versions_verified === true,
    current_candidate_benchmarks_verified:
      readiness?.governance?.current_candidate_benchmarks_verified === true,
    current_example_bindings_verified:
      readiness?.governance?.current_example_bindings_verified === true,
    current_benchmark_suite_binding_verified:
      readiness?.governance?.current_benchmark_suite_binding_verified === true,
    deterministic_suite_verified:
      readiness?.governance?.deterministic_suite_verified === true,
  },
  next_action: "RUN_ONE_GOVERNED_PAIRED_BENCHMARK_UNDER_INTELLIGENCE_BENCHMARK_SAFE_LEASE",
  safety: {
    supabase_write_performed: false,
    runpod_request_performed: false,
    worker_scaling_mutated: false,
    provider_job_submitted: false,
    inference_performed: false,
    training_started: false,
    production_model_promoted: false,
    production_endpoint_mutated: false,
    secrets_printed: false,
  },
}, null, 2));
console.log("AVANTIQO_MODEL_BENCHMARK_READINESS=BENCHMARK_ARTIFACTS_CURRENT");
console.log("AVANTIQO_MODEL_BENCHMARK_READINESS_PROVIDER_JOB_SUBMITTED=NO");
console.log("AVANTIQO_MODEL_BENCHMARK_READINESS_RUNPOD_REQUEST=NO");
console.log("AVANTIQO_MODEL_BENCHMARK_READINESS_PRODUCTION_PROMOTION=NO");
