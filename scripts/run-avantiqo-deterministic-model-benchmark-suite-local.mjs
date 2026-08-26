import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(
  String(value ?? "").trim().toUpperCase(),
);
const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import("@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime");
const {
  compileAvantiqoDeterministicModelBenchmarkSuite,
} = await import("@/lib/intelligence/runtime/AvantiqoDeterministicModelBenchmarkSuiteRuntime");
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

if (!yes(process.env.AVANTIQO_DETERMINISTIC_BENCHMARK_SUITE_APPROVED)) {
  throw new Error("AVANTIQO_DETERMINISTIC_BENCHMARK_SUITE_APPROVED=YES_REQUIRED");
}

const organization = await ensureAvantiqoLearningOrganizationEnvironment();
const requestedJobId = text(process.env.AVANTIQO_MODEL_TRAINING_JOB_RECORD_ID, 160);

let query = supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", "platform_model_training_jobs")
  .eq("active", true)
  .eq("metadata->>status", "PREPARED")
  .order("updated_at", { ascending: false });

if (requestedJobId) {
  query = query.eq("id", requestedJobId).limit(1);
} else {
  query = query.limit(3);
}

const result = await query;
if (result.error) throw result.error;
const jobs = list(result.data);
if (requestedJobId && jobs.length !== 1) {
  throw new Error("AVANTIQO_DETERMINISTIC_BENCHMARK_REQUESTED_PREPARED_JOB_NOT_FOUND");
}
if (!requestedJobId && jobs.length !== 1) {
  throw new Error(
    `AVANTIQO_DETERMINISTIC_BENCHMARK_PREPARED_JOB_AMBIGUOUS:count=${jobs.length}`,
  );
}

const job = jobs[0];

console.log(JSON.stringify({
  contract: "AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_SUITE_LOCAL_V1",
  mode: "PROVIDER_FREE_BENCHMARK_SUITE_PREPARATION",
  learning_organization_resolved: Boolean(organization.organization_id),
  learning_organization_source: organization.source,
  prepared_job_resolved: true,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  training_execution_authorized: false,
  training_execution_started: false,
  model_weight_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const compiled = await compileAvantiqoDeterministicModelBenchmarkSuite({
  trainingJobId: job.id,
});

console.log(JSON.stringify({
  ...compiled,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  training_execution_authorized: false,
  training_execution_started: false,
  model_weight_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (
  compiled.status !== "BENCHMARK_SUITE_COMPILED" ||
  Number(compiled.case_count || 0) !== 60 ||
  compiled.governance?.minimum_promotion_cases_satisfied !== true ||
  compiled.governance?.provider_execution_used !== false ||
  compiled.governance?.runpod_used !== false ||
  compiled.governance?.shared_trainer_mutated !== false ||
  compiled.governance?.training_execution_started !== false
) {
  throw new Error("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_SUITE_CERTIFICATION_FAILED");
}

const expected = {
  task_quality: 20,
  recovery_behavior: 10,
  evidence_tool_discipline: 10,
  authorization_governance: 10,
  privacy_leakage: 5,
  uncertainty_hallucination: 5,
};
for (const [category, count] of Object.entries(expected)) {
  if (Number(compiled.category_counts?.[category] || 0) !== count) {
    throw new Error(
      `AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_CATEGORY_COUNT_FAILED:${category}`,
    );
  }
}

console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_SUITE=PASS");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_CASES=60");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_TASK_QUALITY=20");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_RECOVERY_BEHAVIOR=10");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_EVIDENCE_TOOL_DISCIPLINE=10");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_AUTHORIZATION_GOVERNANCE=10");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_PRIVACY_LEAKAGE=5");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_UNCERTAINTY_HALLUCINATION=5");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_PROVIDER_EXECUTION=NO");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_RUNPOD=NO");
console.log("AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_SHARED_TRAINER_MUTATED=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_AUTHORIZED=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_STARTED=NO");
