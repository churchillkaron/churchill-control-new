import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const candidatePath = "lib/intelligence/runtime/AvantiqoCanonicalCurriculumCandidateRuntime.js";
const benchmarkPath = "lib/intelligence/runtime/AvantiqoCanonicalCurriculumBenchmarkRuntime.js";
const guardPath = "lib/intelligence/runtime/AvantiqoSharedTrainerReservationGuard.js";
const runnerPath = "scripts/run-avantiqo-canonical-curriculum-candidates-local.mjs";
const datasetPath = "lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js";
const compilerPath = "lib/intelligence/runtime/AvantiqoTrainingExampleCompilerRuntime.js";
const indexPath = "lib/intelligence/index.js";

const candidate = read(candidatePath);
const benchmark = read(benchmarkPath);
const guard = read(guardPath);
const runner = read(runnerPath);
const dataset = read(datasetPath);
const compiler = read(compilerPath);
const index = read(indexPath);

assert(candidate.includes("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_V1"), "LEARNING_CANONICAL_CANDIDATE_CONTRACT_REQUIRED");
assert(candidate.includes('CANDIDATE_KIND = "CANONICAL_PRODUCT_GROUNDING"'), "LEARNING_CANONICAL_CANDIDATE_KIND_REQUIRED");
assert(candidate.includes('benchmark_status: "UNREVIEWED"'), "LEARNING_CANONICAL_CANDIDATE_UNREVIEWED_REQUIRED");
assert(candidate.includes("training_ready: false"), "LEARNING_CANONICAL_CANDIDATE_NOT_READY_REQUIRED");
assert(candidate.includes("requires_benchmark_validation: true"), "LEARNING_CANONICAL_CANDIDATE_BENCHMARK_GATE_REQUIRED");
assert(candidate.includes("customer_private_content_included: false"), "LEARNING_CANONICAL_CANDIDATE_PRIVATE_CONTENT_FORBIDDEN");
assert(candidate.includes("raw_reasoning_persisted: false"), "LEARNING_CANONICAL_CANDIDATE_RAW_REASONING_FORBIDDEN");
assert(candidate.includes("source_content_versions"), "LEARNING_CANONICAL_CANDIDATE_CONTENT_VERSION_REQUIRED");
assert(candidate.includes("canonical_content_change_invalidates_review: true"), "LEARNING_CANONICAL_CANDIDATE_CONTENT_CHANGE_INVALIDATION_REQUIRED");
assert(candidate.includes("candidate_identity_stable_across_content_change: true"), "LEARNING_CANONICAL_CANDIDATE_STABLE_IDENTITY_REQUIRED");
assert(candidate.includes("unchanged_candidate_review_state_preserved: true"), "LEARNING_CANONICAL_CANDIDATE_REVIEW_STATE_PRESERVATION_REQUIRED");
assert(candidate.includes('text(priorMetadata.source_fingerprint, 128) !== row.metadata.source_fingerprint'), "LEARNING_CANONICAL_CANDIDATE_SOURCE_CHANGE_GATE_REQUIRED");
assert(!candidate.includes('priorMetadata.training_ready === true ||'), "LEARNING_CANONICAL_CANDIDATE_APPROVAL_RESET_FORBIDDEN");
assert(!candidate.includes('text(priorMetadata.benchmark_status, 80) !== "UNREVIEWED"'), "LEARNING_CANONICAL_CANDIDATE_REVIEW_RESET_FORBIDDEN");
assert(candidate.includes("shared_trainer_mutated: false"), "LEARNING_CANONICAL_CANDIDATE_TRAINER_MUTATION_FORBIDDEN");
assert(candidate.includes("runpod_used: false"), "LEARNING_CANONICAL_CANDIDATE_RUNPOD_FORBIDDEN");

assert(benchmark.includes("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_V1"), "LEARNING_CANONICAL_BENCHMARK_CONTRACT_REQUIRED");
assert(benchmark.includes("const CASE_COUNT = 20"), "LEARNING_CANONICAL_BENCHMARK_MIN_CASES_REQUIRED");
assert(benchmark.includes("reviewAvantiqoTrainingCandidate"), "LEARNING_CANONICAL_BENCHMARK_REVIEW_GATE_REUSE_REQUIRED");
assert(benchmark.includes("source_content_versions"), "LEARNING_CANONICAL_BENCHMARK_CONTENT_VERSION_REQUIRED");
assert(benchmark.includes("storedFingerprint === currentFingerprint"), "LEARNING_CANONICAL_BENCHMARK_CURRENT_FINGERPRINT_REQUIRED");
assert(benchmark.includes('evaluator: "avantiqo-deterministic-canonical-curriculum-evaluator"'), "LEARNING_CANONICAL_BENCHMARK_DETERMINISTIC_EVALUATOR_REQUIRED");
assert(benchmark.includes("privacy_passed: privacyPassed"), "LEARNING_CANONICAL_BENCHMARK_PRIVACY_GATE_REQUIRED");
assert(benchmark.includes("governance_passed: governancePassed"), "LEARNING_CANONICAL_BENCHMARK_GOVERNANCE_GATE_REQUIRED");
assert(benchmark.includes("total_approved_count"), "LEARNING_CANONICAL_BENCHMARK_APPROVED_TOTAL_REQUIRED");
assert(benchmark.includes("provider_execution_used: false"), "LEARNING_CANONICAL_BENCHMARK_PROVIDER_EXECUTION_FORBIDDEN");
assert(benchmark.includes("runpod_used: false"), "LEARNING_CANONICAL_BENCHMARK_RUNPOD_FORBIDDEN");
assert(benchmark.includes("shared_trainer_mutated: false"), "LEARNING_CANONICAL_BENCHMARK_TRAINER_MUTATION_FORBIDDEN");

assert(guard.includes("AVANTIQO_SHARED_TRAINER_RESERVATION_GUARD_V1"), "LEARNING_SHARED_TRAINER_GUARD_CONTRACT_REQUIRED");
assert(guard.includes('"avantiqo-code-v1"'), "LEARNING_SHARED_TRAINER_CODE_PEER_REQUIRED");
assert(guard.includes('"avantiqo-intelligence-v1"'), "LEARNING_SHARED_TRAINER_INTELLIGENCE_PEER_REQUIRED");
assert(guard.includes('"avantiqo-intelligence-candidate-v1"'), "LEARNING_SHARED_TRAINER_CANDIDATE_PEER_REQUIRED");
assert(guard.includes("PEER_SLOT_RESERVED"), "LEARNING_SHARED_TRAINER_PEER_RESERVATION_BLOCK_REQUIRED");
assert(guard.includes("PEER_JOB_QUEUED"), "LEARNING_SHARED_TRAINER_PENDING_PEER_JOB_BLOCK_REQUIRED");
assert(guard.includes("PEER_JOB_IN_PROGRESS"), "LEARNING_SHARED_TRAINER_ACTIVE_PEER_JOB_BLOCK_REQUIRED");
assert(guard.includes("stable_observations: 2"), "LEARNING_SHARED_TRAINER_STABLE_RECHECK_REQUIRED");
assert(guard.includes("endpoint_mutation_performed: false"), "LEARNING_SHARED_TRAINER_GUARD_READ_ONLY_REQUIRED");
assert(guard.includes("provider_job_submitted: false"), "LEARNING_SHARED_TRAINER_GUARD_NO_SUBMIT_REQUIRED");

assert(runner.includes("AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_SEED_APPROVED=YES_REQUIRED"), "LEARNING_CANDIDATE_SEED_EXPLICIT_APPROVAL_REQUIRED");
assert(runner.includes("AVANTIQO_CANONICAL_CURRICULUM_BENCHMARK_APPROVED=YES_REQUIRED"), "LEARNING_CANDIDATE_BENCHMARK_EXPLICIT_APPROVAL_REQUIRED");
assert(runner.includes("total_approved_count"), "LEARNING_CANDIDATE_RUNNER_TRUE_APPROVED_COUNT_REQUIRED");
assert(runner.includes("shared_trainer_mutated: false"), "LEARNING_CANDIDATE_RUNNER_TRAINER_MUTATION_FORBIDDEN");
assert(runner.includes("model_training_started: false"), "LEARNING_CANDIDATE_RUNNER_TRAINING_FORBIDDEN");
assert(runner.includes("runpod_used: false"), "LEARNING_CANDIDATE_RUNNER_RUNPOD_FORBIDDEN");

assert(dataset.includes("MIN_READY_CANDIDATES = 8"), "LEARNING_DATASET_MIN_APPROVED_CANDIDATES_REQUIRED");
assert(dataset.includes('candidate.benchmark_status, 80) === "APPROVED"'), "LEARNING_DATASET_APPROVED_CANDIDATES_ONLY_REQUIRED");
assert(dataset.includes("candidate.training_ready === true"), "LEARNING_DATASET_READY_CANDIDATES_ONLY_REQUIRED");
assert(dataset.includes("deterministic_holdout_split: true"), "LEARNING_DATASET_HOLDOUT_REQUIRED");

assert(compiler.includes('"VERIFIED_FAILURE_RECOVERY"'), "LEARNING_COMPILER_RECOVERY_KIND_REQUIRED");
assert(compiler.includes('"CANONICAL_PRODUCT_GROUNDING"'), "LEARNING_COMPILER_CANONICAL_KIND_REQUIRED");
assert(compiler.includes("curriculumInstruction"), "LEARNING_COMPILER_KIND_SPECIFIC_INSTRUCTION_REQUIRED");
assert(compiler.includes("current canonical Product Constitution"), "LEARNING_COMPILER_CANONICAL_PRODUCT_GROUNDING_REQUIRED");
assert(compiler.includes("prior evidence shows an approach repeatedly failed"), "LEARNING_COMPILER_RECOVERY_CURRICULUM_REQUIRED");
assert(compiler.includes("canonical_product_grounding_supported: true"), "LEARNING_COMPILER_CANONICAL_GOVERNANCE_EVIDENCE_REQUIRED");

assert(index.includes("AvantiqoCanonicalCurriculumCandidateRuntime"), "LEARNING_CANONICAL_CANDIDATE_EXPORT_REQUIRED");
assert(index.includes("AvantiqoCanonicalCurriculumBenchmarkRuntime"), "LEARNING_CANONICAL_BENCHMARK_EXPORT_REQUIRED");
assert(index.includes("AvantiqoSharedTrainerReservationGuard"), "LEARNING_SHARED_TRAINER_GUARD_EXPORT_REQUIRED");

console.log("AVANTIQO_LEARNING_CURRICULUM_SAFETY_AUDIT=PASS");
console.log("AVANTIQO_LEARNING_CANONICAL_CANDIDATE_PROVIDER_FREE=YES");
console.log("AVANTIQO_LEARNING_CANONICAL_CANDIDATE_REVIEW_STATE_PRESERVED=YES");
console.log("AVANTIQO_LEARNING_CANONICAL_CONTENT_CHANGE_REBENCHMARK=REQUIRED");
console.log("AVANTIQO_LEARNING_CANONICAL_BENCHMARK_CASES=20");
console.log("AVANTIQO_LEARNING_CANONICAL_BENCHMARK_PROVIDER_EXECUTION=NO");
console.log("AVANTIQO_LEARNING_CANONICAL_COMPILER_BRANCH=READY");
console.log("AVANTIQO_LEARNING_SHARED_TRAINER_GUARD=FAIL_CLOSED");
console.log("AVANTIQO_LEARNING_SHARED_TRAINER_MUTATION_PERFORMED=NO");
