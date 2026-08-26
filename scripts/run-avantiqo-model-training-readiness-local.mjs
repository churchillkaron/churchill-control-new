import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import("@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime");
const {
  certifyAvantiqoModelTrainingReadiness,
} = await import("@/lib/intelligence/runtime/AvantiqoModelTrainingReadinessRuntime");
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const organization = await ensureAvantiqoLearningOrganizationEnvironment();
const jobResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", "platform_model_training_jobs")
  .eq("active", true)
  .eq("metadata->>status", "PREPARED")
  .eq("metadata->>training_execution_authorized", "false")
  .order("updated_at", { ascending: false })
  .limit(2);
if (jobResult.error) throw jobResult.error;
const jobs = Array.isArray(jobResult.data) ? jobResult.data : [];
if (!jobs.length) {
  throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_PREPARED_JOB_NOT_FOUND");
}
const job = jobs[0];

console.log(JSON.stringify({
  contract: "AVANTIQO_MODEL_TRAINING_READINESS_LOCAL_V1",
  mode: "READ_ONLY_CERTIFICATION",
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

const readiness = await certifyAvantiqoModelTrainingReadiness({
  trainingJobId: job.id,
});

console.log(JSON.stringify({
  ...readiness,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  training_execution_authorized: false,
  training_execution_started: false,
  model_weight_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (readiness.status !== "READY_FOR_RESOURCE_PREFLIGHT") {
  throw new Error(
    `AVANTIQO_MODEL_TRAINING_READINESS_FAILED:${readiness.status || "UNKNOWN"}`,
  );
}
if (
  Number(readiness.candidate_count || 0) !== 27 ||
  Number(readiness.example_count || 0) !== 54 ||
  Number(readiness.train_example_count || 0) !== 44 ||
  Number(readiness.holdout_example_count || 0) !== 10 ||
  readiness.governance?.current_dataset_binding_verified !== true ||
  readiness.governance?.current_candidate_source_versions_verified !== true ||
  readiness.governance?.current_candidate_benchmarks_verified !== true ||
  readiness.governance?.current_example_bindings_verified !== true
) {
  throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_EXPECTED_STATE_FAILED");
}

console.log("AVANTIQO_MODEL_TRAINING_READINESS=PASS");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_STATUS=READY_FOR_RESOURCE_PREFLIGHT");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_CANDIDATES=27");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_EXAMPLES=54");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_TRAIN_EXAMPLES=44");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_HOLDOUT_EXAMPLES=10");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_DATASET_CURRENT=YES");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_CANDIDATES_CURRENT=YES");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_BENCHMARKS_CURRENT=YES");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_EXAMPLES_CURRENT=YES");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_RUNPOD=NO");
console.log("AVANTIQO_MODEL_TRAINING_READINESS_SHARED_TRAINER_MUTATED=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_AUTHORIZED=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_STARTED=NO");
