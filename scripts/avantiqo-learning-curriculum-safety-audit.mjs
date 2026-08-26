import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

const candidatePath = "lib/intelligence/runtime/AvantiqoCanonicalCurriculumCandidateRuntime.js";
const guardPath = "lib/intelligence/runtime/AvantiqoSharedTrainerReservationGuard.js";
const runnerPath = "scripts/run-avantiqo-canonical-curriculum-candidates-local.mjs";
const datasetPath = "lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js";
const compilerPath = "lib/intelligence/runtime/AvantiqoTrainingExampleCompilerRuntime.js";
const indexPath = "lib/intelligence/index.js";

const candidate = read(candidatePath);
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
assert(candidate.includes("unchanged_candidate_review_state_preserved: true"), "LEARNING_CANONICAL_CANDIDATE_REVIEW_STATE_PRESERVATION_REQUIRED");
assert(candidate.includes('text(priorMetadata.source_fingerprint, 128) !== row.metadata.source_fingerprint'), "LEARNING_CANONICAL_CANDIDATE_SOURCE_CHANGE_GATE_REQUIRED");
assert(!candidate.includes('priorMetadata.training_ready === true ||'), "LEARNING_CANONICAL_CANDIDATE_APPROVAL_RESET_FORBIDDEN");
assert(!candidate.includes('text(priorMetadata.benchmark_status, 80) !== "UNREVIEWED"'), "LEARNING_CANONICAL_CANDIDATE_REVIEW_RESET_FORBIDDEN");
assert(candidate.includes("shared_trainer_mutated: false"), "LEARNING_CANONICAL_CANDIDATE_TRAINER_MUTATION_FORBIDDEN");
assert(candidate.includes("runpod_used: false"), "LEARNING_CANONICAL_CANDIDATE_RUNPOD_FORBIDDEN");

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
assert(runner.includes("shared_trainer_mutated: false"), "LEARNING_CANDIDATE_RUNNER_TRAINER_MUTATION_FORBIDDEN");
assert(runner.includes("model_training_started: false"), "LEARNING_CANDIDATE_RUNNER_TRAINING_FORBIDDEN");
assert(runner.includes("runpod_used: false"), "LEARNING_CANDIDATE_RUNNER_RUNPOD_FORBIDDEN");

assert(dataset.includes("MIN_READY_CANDIDATES = 8"), "LEARNING_DATASET_MIN_APPROVED_CANDIDATES_REQUIRED");
assert(dataset.includes('candidate.benchmark_status, 80) === "APPROVED"'), "LEARNING_DATASET_APPROVED_CANDIDATES_ONLY_REQUIRED");
assert(dataset.includes("candidate.training_ready === true"), "LEARNING_DATASET_READY_CANDIDATES_ONLY_REQUIRED");
assert(dataset.includes("deterministic_holdout_split: true"), "LEARNING_DATASET_HOLDOUT_REQUIRED");

assert(compiler.includes("candidate_kind"), "LEARNING_COMPILER_CANDIDATE_KIND_AVAILABLE_REQUIRED");
assert(compiler.includes("prior evidence shows an approach repeatedly failed"), "LEARNING_COMPILER_RECOVERY_CURRICULUM_PRESENT");
// Canonical candidates must not enter actual dataset/training until the compiler
// has an explicit CANONICAL_PRODUCT_GROUNDING curriculum branch. This audit keeps
// that boundary visible rather than silently treating product grounding as failure recovery.
const canonicalCompilerSupported = compiler.includes("CANONICAL_PRODUCT_GROUNDING");

assert(index.includes("AvantiqoCanonicalCurriculumCandidateRuntime"), "LEARNING_CANONICAL_CANDIDATE_EXPORT_REQUIRED");
assert(index.includes("AvantiqoSharedTrainerReservationGuard"), "LEARNING_SHARED_TRAINER_GUARD_EXPORT_REQUIRED");

console.log("AVANTIQO_LEARNING_CURRICULUM_SAFETY_AUDIT=PASS");
console.log("AVANTIQO_LEARNING_CANONICAL_CANDIDATE_PROVIDER_FREE=YES");
console.log("AVANTIQO_LEARNING_CANONICAL_CANDIDATE_REVIEW_STATE_PRESERVED=YES");
console.log("AVANTIQO_LEARNING_CANONICAL_CANDIDATE_BENCHMARK_REQUIRED=YES");
console.log("AVANTIQO_LEARNING_SHARED_TRAINER_GUARD=FAIL_CLOSED");
console.log("AVANTIQO_LEARNING_SHARED_TRAINER_MUTATION_PERFORMED=NO");
console.log(`AVANTIQO_LEARNING_CANONICAL_COMPILER_BRANCH=${canonicalCompilerSupported ? "READY" : "BLOCKED_PENDING_EXPLICIT_BRANCH"}`);
