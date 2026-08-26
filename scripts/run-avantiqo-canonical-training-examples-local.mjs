import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const apply = process.argv.includes("--apply");
const prepare = process.argv.includes("--prepare");
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(
  String(value ?? "").trim().toUpperCase(),
);

if (prepare && !apply) {
  throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_PREPARE_REQUIRES_APPLY");
}

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import("@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime");
const {
  compileAvantiqoCanonicalTrainingExamples,
} = await import("@/lib/intelligence/runtime/AvantiqoCanonicalTrainingExampleRuntime");
const {
  prepareAvantiqoModelTrainingJob,
} = await import("@/lib/intelligence/runtime/AvantiqoModelImprovementRuntime");
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const organization = await ensureAvantiqoLearningOrganizationEnvironment();
console.log(JSON.stringify({
  contract: "AVANTIQO_CANONICAL_TRAINING_EXAMPLE_LOCAL_V1",
  mode: prepare ? "APPLY_AND_PREPARE" : apply ? "APPLY" : "PLAN",
  learning_organization_resolved: Boolean(organization.organization_id),
  learning_organization_source: organization.source,
  organization_created: false,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  training_execution_started: false,
  model_weight_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const datasetResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", "platform_training_datasets")
  .eq("active", true)
  .eq("metadata->>status", "DATASET_ASSEMBLED")
  .eq("metadata->>training_ready", "true")
  .order("updated_at", { ascending: false })
  .limit(2);
if (datasetResult.error) throw datasetResult.error;
const datasets = Array.isArray(datasetResult.data) ? datasetResult.data : [];
if (!datasets.length) {
  throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_NOT_FOUND");
}
const dataset = datasets[0];
const datasetMetadata = dataset.metadata && typeof dataset.metadata === "object"
  ? dataset.metadata
  : {};
if (
  datasetMetadata.source_version_bound !== true ||
  datasetMetadata.benchmark_version_bound !== true
) {
  throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_VERSION_BINDING_REQUIRED");
}

console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_RESOLUTION=PASS");
console.log(`AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_MANIFEST_ID=${dataset.id}`);
console.log(`AVANTIQO_CANONICAL_TRAINING_EXAMPLE_DATASET_FINGERPRINT=${String(datasetMetadata.dataset_fingerprint || "")}`);

if (!apply) {
  console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_PLAN=PASS");
  process.exit(0);
}

if (!yes(process.env.AVANTIQO_CANONICAL_TRAINING_EXAMPLE_COMPILE_APPROVED)) {
  throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_COMPILE_APPROVED=YES_REQUIRED");
}

const compiled = await compileAvantiqoCanonicalTrainingExamples({
  datasetManifestId: dataset.id,
});
console.log(JSON.stringify({
  ...compiled,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  training_execution_started: false,
  model_weight_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (compiled.status !== "EXAMPLES_COMPILED") {
  throw new Error(`AVANTIQO_CANONICAL_TRAINING_EXAMPLE_COMPILE_FAILED:${compiled.status || "UNKNOWN"}`);
}
if (
  Number(compiled.curriculum_unit_count || 0) !== 27 ||
  Number(compiled.example_count || 0) !== 54 ||
  Number(compiled.train_example_count || 0) !== 44 ||
  Number(compiled.holdout_example_count || 0) !== 10 ||
  compiled.validation?.passed !== true
) {
  throw new Error("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_EXPECTED_COUNTS_FAILED");
}

console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_COMPILE=PASS");
console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_COUNT=54");
console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_TRAIN_COUNT=44");
console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_HOLDOUT_COUNT=10");
console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_PROVIDER_EXECUTION=NO");
console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_RUNPOD=NO");
console.log("AVANTIQO_CANONICAL_TRAINING_EXAMPLE_SHARED_TRAINER_MUTATED=NO");

if (!prepare) {
  console.log("AVANTIQO_MODEL_TRAINING_JOB_PREPARED=NO");
  process.exit(0);
}

if (!yes(process.env.AVANTIQO_MODEL_TRAINING_JOB_PREPARE_APPROVED)) {
  throw new Error("AVANTIQO_MODEL_TRAINING_JOB_PREPARE_APPROVED=YES_REQUIRED");
}

const job = await prepareAvantiqoModelTrainingJob({ datasetId: dataset.id });
console.log(JSON.stringify({
  ...job,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  training_execution_started: false,
  model_weight_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (job.status !== "TRAINING_JOB_PREPARED" || !job.job?.id) {
  throw new Error(`AVANTIQO_MODEL_TRAINING_JOB_PREPARE_FAILED:${job.status || "UNKNOWN"}`);
}
if (
  job.job?.metadata?.status !== "PREPARED" ||
  job.job?.metadata?.training_execution_authorized !== false ||
  job.job?.metadata?.automatic_training_started !== false ||
  job.job?.metadata?.automatic_model_weight_mutation !== false
) {
  throw new Error("AVANTIQO_MODEL_TRAINING_JOB_PREPARATION_GOVERNANCE_FAILED");
}

console.log("AVANTIQO_MODEL_TRAINING_JOB_PREPARATION=PASS");
console.log(`AVANTIQO_MODEL_TRAINING_JOB_RECORD_ID=${job.job.id}`);
console.log("AVANTIQO_MODEL_TRAINING_JOB_STATUS=PREPARED");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_AUTHORIZED=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_STARTED=NO");
console.log("AVANTIQO_MODEL_TRAINING_JOB_RUNPOD=NO");
console.log("AVANTIQO_MODEL_TRAINING_JOB_SHARED_TRAINER_MUTATED=NO");
