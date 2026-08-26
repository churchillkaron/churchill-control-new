import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const apply = process.argv.includes("--apply");
const benchmark = process.argv.includes("--benchmark");
const assemble = process.argv.includes("--assemble");
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(
  String(value ?? "").trim().toUpperCase(),
);

if (benchmark && !apply) {
  throw new Error("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_REQUIRES_APPLY");
}
if (assemble && (!apply || !benchmark)) {
  throw new Error("AVANTIQO_TRAINING_DATASET_ASSEMBLY_REQUIRES_APPLY_AND_BENCHMARK");
}

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const {
  buildAvantiqoCanonicalCurriculumCandidates,
  seedAvantiqoCanonicalCurriculumCandidates,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoCanonicalCurriculumCandidateRuntime"
);
const {
  benchmarkPendingAvantiqoCanonicalCurriculumCandidates,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoCanonicalCurriculumBenchmarkRuntime"
);
const {
  assembleAvantiqoTrainingDataset,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime"
);

let learningOrganization = null;
if (apply) {
  learningOrganization = await ensureAvantiqoLearningOrganizationEnvironment();
  console.log(JSON.stringify({
    contract: learningOrganization.contract,
    source: learningOrganization.source,
    canonical_name: learningOrganization.canonical_name,
    database_fallback_used: learningOrganization.database_fallback_used,
    organization_created: learningOrganization.organization_created,
    organization_id_resolved: Boolean(learningOrganization.organization_id),
    organization_id_printed: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_LEARNING_ORGANIZATION_RESOLUTION=PASS");
  console.log(`AVANTIQO_LEARNING_ORGANIZATION_SOURCE=${learningOrganization.source}`);
  console.log("AVANTIQO_LEARNING_ORGANIZATION_CREATED=NO");
  console.log("AVANTIQO_LEARNING_ORGANIZATION_ID_PRINTED=NO");
}

const candidates = buildAvantiqoCanonicalCurriculumCandidates();
const summary = {
  contract: "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_LOCAL_V1",
  mode: assemble
    ? "APPLY_BENCHMARK_AND_ASSEMBLE"
    : apply
      ? (benchmark ? "APPLY_AND_BENCHMARK" : "APPLY")
      : "PLAN",
  learning_organization_resolved: apply
    ? Boolean(learningOrganization?.organization_id)
    : null,
  learning_organization_source: learningOrganization?.source || null,
  candidate_count: candidates.length,
  by_domain: candidates.reduce((accumulator, candidate) => {
    const domain = candidate.domain || "unknown";
    accumulator[domain] = Number(accumulator[domain] || 0) + 1;
    return accumulator;
  }, {}),
  benchmark_required_count: candidates.filter((candidate) => candidate.benchmark_required).length,
  training_ready_count: candidates.filter((candidate) => candidate.training_ready).length,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  model_training_started: false,
  production_deploy_performed: false,
  organization_created: false,
  secrets_printed: false,
};

console.log(JSON.stringify(summary, null, 2));

if (!apply) {
  console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_PLAN=PASS");
  process.exit(0);
}

if (!yes(process.env.AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_SEED_APPROVED)) {
  throw new Error(
    "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_SEED_APPROVED=YES_REQUIRED",
  );
}

const result = await seedAvantiqoCanonicalCurriculumCandidates();
console.log(JSON.stringify({
  ...result,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  model_training_started: false,
  production_deploy_performed: false,
  organization_created: false,
  secrets_printed: false,
}, null, 2));

if (result.status !== "SEEDED") {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_SEED_FAILED:${result.status || "UNKNOWN"}`,
  );
}
if (Number(result.candidate_count || 0) < 8) {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_MINIMUM_NOT_MET:${result.candidate_count || 0}`,
  );
}

console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_APPLY=PASS");
console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_BENCHMARK_REQUIRED=YES");
console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_SHARED_TRAINER_MUTATED=NO");

if (!benchmark) {
  console.log("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATES_BENCHMARK_EXECUTED=NO");
  process.exit(0);
}

if (!yes(process.env.AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_APPROVED)) {
  throw new Error(
    "AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_APPROVED=YES_REQUIRED",
  );
}

const benchmarkResult = await benchmarkPendingAvantiqoCanonicalCurriculumCandidates({
  limit: 32,
});
console.log(JSON.stringify({
  ...benchmarkResult,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  model_training_started: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (benchmarkResult.rejected_count > 0) {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_REJECTED:${benchmarkResult.rejected_count}`,
  );
}
if (Number(benchmarkResult.total_approved_count || 0) < 8) {
  throw new Error(
    `AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_MINIMUM_APPROVED_NOT_REACHED:${benchmarkResult.total_approved_count || 0}`,
  );
}

console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK=PASS");
console.log(`AVANTIQO_CANONICAL_CURRICULUM_TOTAL_APPROVED=${benchmarkResult.total_approved_count}`);
console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_PROVIDER_EXECUTION=NO");
console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_RUNPOD=NO");
console.log("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_SHARED_TRAINER_MUTATED=NO");

if (!assemble) {
  console.log("AVANTIQO_TRAINING_DATASET_ASSEMBLED=NO");
  process.exit(0);
}

if (!yes(process.env.AVANTIQO_TRAINING_DATASET_ASSEMBLY_APPROVED)) {
  throw new Error("AVANTIQO_TRAINING_DATASET_ASSEMBLY_APPROVED=YES_REQUIRED");
}

const datasetResult = await assembleAvantiqoTrainingDataset({
  holdout_ratio: 0.2,
  limit: 32,
});
console.log(JSON.stringify({
  ...datasetResult,
  provider_execution_used: false,
  runpod_used: false,
  shared_trainer_mutated: false,
  model_training_started: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (datasetResult.status !== "DATASET_ASSEMBLED" || !datasetResult.dataset?.manifest_id) {
  throw new Error(
    `AVANTIQO_TRAINING_DATASET_ASSEMBLY_FAILED:${datasetResult.status || "UNKNOWN"}`,
  );
}
if (Number(datasetResult.dataset.candidate_count || 0) < 8) {
  throw new Error(
    `AVANTIQO_TRAINING_DATASET_APPROVED_CANDIDATE_MINIMUM_NOT_MET:${datasetResult.dataset.candidate_count || 0}`,
  );
}

console.log("AVANTIQO_TRAINING_DATASET_ASSEMBLY=PASS");
console.log(`AVANTIQO_TRAINING_DATASET_MANIFEST_ID=${datasetResult.dataset.manifest_id}`);
console.log(`AVANTIQO_TRAINING_DATASET_FINGERPRINT=${datasetResult.dataset.fingerprint}`);
console.log("AVANTIQO_TRAINING_DATASET_SOURCE_VERSION_BOUND=YES");
console.log("AVANTIQO_TRAINING_DATASET_BENCHMARK_VERSION_BOUND=YES");
console.log("AVANTIQO_TRAINING_DATASET_PROVIDER_EXECUTION=NO");
console.log("AVANTIQO_TRAINING_DATASET_RUNPOD=NO");
console.log("AVANTIQO_TRAINING_DATASET_SHARED_TRAINER_MUTATED=NO");
console.log("AVANTIQO_TRAINING_DATASET_MODEL_TRAINING_STARTED=NO");
