import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const capture = read("lib/creative/learning/runtime/CreativeTrainingCandidateRuntime.js");
const preference = read("lib/creative/learning/runtime/CreativePreferenceLearningRuntime.js");
const studio = read("lib/creative/learning/runtime/CreativeStudioLearningRuntime.js");
const selection = read("lib/creative/quality/runtime/CreativeShotCandidateSelectionRuntime.js");
const dataset = read("lib/intelligence/runtime/AvantiqoTrainingDatasetRuntime.js");
const compiler = read("lib/intelligence/runtime/AvantiqoTrainingExampleCompilerRuntime.js");
const readiness = read("lib/intelligence/runtime/AvantiqoModelTrainingReadinessRuntime.js");
const benchmarkReadiness = read("lib/intelligence/runtime/AvantiqoModelBenchmarkReadinessRuntime.js");
const execution = read("lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime.js");
const modalTrainer = read("services/avantiqo-intelligence-trainer/modal_app.py");

assert.ok(capture.includes("AVANTIQO_CREATIVE_TRAINING_CANDIDATE_V1"));
assert.ok(capture.includes('CANDIDATE_KIND = "CREATIVE_PREFERENCE_PAIR"'));
assert.ok(capture.includes("selected_for_master === true"));
assert.ok(capture.includes("rejected_by_candidate_competition === true"));
assert.ok(capture.includes("customer_private_content_included: false"));
assert.ok(capture.includes("raw_payload_persisted: false"));
assert.ok(capture.includes("raw_output_persisted: false"));
assert.ok(capture.includes("raw_reasoning_persisted: false"));
assert.ok(capture.includes("identifiers_persisted: false"));
assert.ok(capture.includes("imitation_of_prior_work_allowed: false"));
assert.ok(selection.includes("CreativeTrainingCandidateRuntime.capture"));

assert.ok(preference.includes("AVANTIQO_CREATIVE_PREFERENCE_LEARNING_V1"));
assert.ok(preference.includes("MIN_RECURRENT_SAMPLE = 3"));
assert.ok(preference.includes('evidence_role: "ADVISORY_STRUCTURAL_PRIOR"'));
assert.ok(preference.includes("style_copying_allowed: false"));
assert.ok(studio.includes("structural_preference_learning"));

assert.ok(dataset.includes('CREATIVE_PREFERENCE_PAIR'));
assert.ok(dataset.includes('TRAINING_BACKEND = "MODAL_H100_OWNED_TRAINER_V1"'));
assert.ok(compiler.includes('"CREATIVE_PREFERENCE_PAIR"'));
assert.ok(compiler.includes("Never reconstruct or imitate prior customer creative"));
assert.ok(readiness.includes('CREATIVE_PREFERENCE_PAIR: "AVANTIQO_CREATIVE_TRAINING_CANDIDATE_V1"'));
assert.ok(benchmarkReadiness.includes('CREATIVE_PREFERENCE_PAIR: "AVANTIQO_CREATIVE_TRAINING_CANDIDATE_V1"'));

assert.ok(execution.includes("AVANTIQO_MODEL_TRAINING_EXECUTION_V2"));
assert.ok(execution.includes('APP_NAME = "avantiqo-intelligence-trainer-owned"'));
assert.ok(execution.includes('INFRASTRUCTURE_PROVIDER = "MODAL_H100_OWNED_TRAINER_V1"'));
assert.ok(execution.includes("worker.spawn([payload])"));
assert.ok(execution.includes("public_training_endpoint_used: false"));
assert.ok(execution.includes("runpod_used: false"));
assert.ok(!execution.includes("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID"));

assert.ok(modalTrainer.includes('GPU = "H100"'));
assert.ok(modalTrainer.includes("modal.Volume.from_name"));
assert.ok(modalTrainer.includes("max_containers=1"));
assert.ok(!modalTrainer.includes("fastapi_endpoint"));
assert.ok(!modalTrainer.includes("runpod=="));
assert.ok(modalTrainer.includes('"foundation_weights_mutated": False'));
assert.ok(modalTrainer.includes('"production_model_promoted": False'));

console.log("AVANTIQO_CREATIVE_OWNED_LEARNING_TRAINING=PASS");
