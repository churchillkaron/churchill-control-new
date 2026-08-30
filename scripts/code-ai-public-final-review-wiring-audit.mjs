#!/usr/bin/env node

import fs from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_PUBLIC_FINAL_REVIEW_WIRING_AUDIT_V1";

const FILES = Object.freeze({
  publicCapability: "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  warmFastStart: "lib/code/runtime/CodeAIEmployeeFastStartRuntime.js",
  zeroIdleFastStart: "lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js",
  finalReview: "lib/code/runtime/CodeAIEmployeeFinalReviewRuntime.js",
});

function required(condition, code) {
  if (!condition) throw new Error(`${CONTRACT}_${code}`);
}

function indexOfRequired(source, needle, code) {
  const index = source.indexOf(needle);
  required(index >= 0, code);
  return index;
}

const [publicCapability, warmFastStart, zeroIdleFastStart, finalReview] = await Promise.all([
  fs.readFile(FILES.publicCapability, "utf8"),
  fs.readFile(FILES.warmFastStart, "utf8"),
  fs.readFile(FILES.zeroIdleFastStart, "utf8"),
  fs.readFile(FILES.finalReview, "utf8"),
]);

required(
  warmFastStart.includes('from "./CodeAIEmployeeFinalReviewRuntime.js"'),
  "WARM_FAST_START_FINAL_REVIEW_IMPORT_REQUIRED",
);
required(
  zeroIdleFastStart.includes('from "./CodeAIEmployeeFinalReviewRuntime.js"'),
  "ZERO_IDLE_FAST_START_FINAL_REVIEW_IMPORT_REQUIRED",
);
required(
  !warmFastStart.includes('from "./CodeAIEmployeeRuntime.js"'),
  "WARM_FAST_START_UNREVIEWED_EMPLOYEE_IMPORT_FORBIDDEN",
);
required(
  !zeroIdleFastStart.includes('from "./CodeAIEmployeeRuntime.js"'),
  "ZERO_IDLE_FAST_START_UNREVIEWED_EMPLOYEE_IMPORT_FORBIDDEN",
);

required(
  finalReview.includes("runCodeAIFinalIndependentReview"),
  "FINAL_REVIEW_RUNNER_REQUIRED",
);
required(
  finalReview.includes("assessCodeAIFinalIndependentReviewGate"),
  "FINAL_REVIEW_GATE_REQUIRED",
);
required(
  finalReview.includes('status: "review_required"'),
  "FINAL_REVIEW_BLOCKING_STATE_REQUIRED",
);
required(
  finalReview.includes('status: "completed"'),
  "FINAL_REVIEW_COMPLETION_STATE_REQUIRED",
);

required(
  publicCapability.includes("executeCodeAIEmployeeFastStartMission"),
  "PUBLIC_WARM_TRANSPORT_REQUIRED",
);
required(
  publicCapability.includes("executeCodeAIEmployeeZeroIdleFastStartMission"),
  "PUBLIC_ZERO_IDLE_TRANSPORT_REQUIRED",
);

const executeIndex = indexOfRequired(
  publicCapability,
  "const result = await executeFastStart({",
  "PUBLIC_FAST_START_EXECUTION_REQUIRED",
);
const attestIndex = indexOfRequired(
  publicCapability,
  "result.state = attestCodeMissionState({",
  "PUBLIC_ATTESTATION_REQUIRED",
);
const persistIndex = indexOfRequired(
  publicCapability,
  "persistCodeAIAutonomousExecutionState({",
  "PUBLIC_PERSISTENCE_REQUIRED",
);
const learningIndex = indexOfRequired(
  publicCapability,
  "handoffVerifiedCodeMissionToLearning({",
  "PUBLIC_LEARNING_HANDOFF_REQUIRED",
);

required(executeIndex < attestIndex, "FINAL_REVIEWED_EXECUTION_MUST_PRECEDE_ATTESTATION");
required(attestIndex < persistIndex, "ATTESTATION_MUST_PRECEDE_PERSISTENCE");
required(persistIndex < learningIndex, "PERSISTENCE_MUST_PRECEDE_LEARNING");
required(
  publicCapability.includes("verifiedEmployeeCompletion(result)"),
  "LEARNING_VERIFIED_COMPLETION_GUARD_REQUIRED",
);

const report = {
  success: true,
  contract: CONTRACT,
  public_capability: "platform.code_ai_autonomous",
  warm_fast_start_final_reviewed: true,
  zero_idle_fast_start_final_reviewed: true,
  unreviewed_fast_start_employee_imports: 0,
  final_review_blocking_semantics_present: true,
  final_reviewed_execution_before_attestation: true,
  attestation_before_persistence: true,
  persistence_before_learning: true,
  learning_requires_verified_employee_completion: true,
  provider_execution_performed: false,
  model_inference_performed: false,
  runpod_mutation_performed: false,
  wallet_mutation_performed: false,
  source_mutation_performed_by_audit: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
