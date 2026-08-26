import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const assessorPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoExperimentOutcomeAssessorCalibrationRuntime.js",
);
const guardPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoAssessorCalibratedEstimatorSelectionGuardRuntime.js",
);
const estimatorPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoExperimentEstimatorCalibrationRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

const assessor = fs.readFileSync(assessorPath, "utf8");
const guard = fs.readFileSync(guardPath, "utf8");
const estimator = fs.readFileSync(estimatorPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

const position = (needle) => route.indexOf(needle);
const checks = [
  [
    "assessor calibration contract",
    assessor.includes("AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_V1"),
  ],
  [
    "assessor calibration durable scope",
    assessor.includes("platform_learning_experiment_information_outcome_assessor_calibrations"),
  ],
  [
    "leave one out target exclusion",
    assessor.includes("target_assessor_excluded_from_consensus: true") &&
      assessor.includes("target_assessor_all_methods_excluded_from_consensus: true") &&
      assessor.includes("self_referential_calibration_forbidden: true"),
  ],
  [
    "minimum two peer assessors",
    assessor.includes("const MIN_PEER_ASSESSORS = 2"),
  ],
  [
    "minimum two peer methods",
    assessor.includes("const MIN_PEER_METHODS = 2"),
  ],
  [
    "mature assessor needs three calibration events",
    assessor.includes("const MIN_CALIBRATION_EVENTS = 3"),
  ],
  [
    "mature assessor needs two experiments",
    assessor.includes("const MIN_DISTINCT_EXPERIMENTS = 2"),
  ],
  [
    "assessor unsafe optimism quarantine",
    assessor.includes('"QUARANTINED_UNSAFE_OPTIMISM"') &&
      assessor.includes("unsafe_optimism_quarantine_active: unsafeOptimism"),
  ],
  [
    "assessor calibration cannot improve realized information gain",
    assessor.includes("calibration_can_improve_realized_information_gain: false"),
  ],
  [
    "assessor numeric assessment retained",
    assessor.includes("quarantined_assessment_numeric_value_must_be_retained: true"),
  ],
  [
    "no automatic assessor rehabilitation",
    assessor.includes("automatic_rehabilitation: false") &&
      assessor.includes("automatic_assessor_rehabilitation: false"),
  ],
  [
    "assessor calibration no execution authority",
    assessor.includes("execution_authorized: false") &&
      assessor.includes("spend_authorized: false") &&
      assessor.includes("provider_execution_authorized: false") &&
      assessor.includes("runpod_job_submitted: false"),
  ],
  [
    "assessor calibration no knowledge promotion or training",
    assessor.includes("reusable_platform_knowledge: false") &&
      assessor.includes("automatic_knowledge_promotion: false") &&
      assessor.includes('automatic_training_effect: "NONE"'),
  ],
  [
    "secondary guard contract",
    guard.includes("AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_V1"),
  ],
  [
    "trusted estimator information event requires three assessors",
    guard.includes("const MIN_ASSESSORS_PER_TRUSTED_EVENT = 3"),
  ],
  [
    "trusted estimator information event requires two methods",
    guard.includes("const MIN_METHODS_PER_TRUSTED_EVENT = 2"),
  ],
  [
    "trusted estimator history requires three information events",
    guard.includes("const MIN_TRUSTED_INFORMATION_EVENTS = 3"),
  ],
  [
    "trusted estimator history needs two experiments",
    guard.includes("const MIN_DISTINCT_EXPERIMENTS = 2"),
  ],
  [
    "quarantined assessor cannot enable estimator qualification",
    guard.includes("quarantined_assessors_can_enable_estimator_qualification: false"),
  ],
  [
    "secondary guard preserves numeric estimates",
    guard.includes("original_numeric_estimates_are_mutated: false") &&
      guard.includes("original_numeric_assessments_are_mutated: false"),
  ],
  [
    "secondary guard cannot improve selection score",
    guard.includes("guard_can_improve_selection_score: false"),
  ],
  [
    "secondary guard is fail closed",
    guard.includes("fail_closed_before_execution_request_generation: true") &&
      guard.includes("fail_closed_retirement_only: true"),
  ],
  [
    "Phase21 still requires independent assessments",
    estimator.includes("MIN_INDEPENDENT_OUTCOME_ASSESSORS") &&
      estimator.includes("MIN_OUTCOME_ASSESSMENT_METHODS") &&
      estimator.includes("information_gain_not_inferred_from_receipt_or_result_text: true"),
  ],
  [
    "cron runs assessor calibration before estimator calibration",
    position("reconcileAvantiqoExperimentOutcomeAssessorCalibration()") >= 0 &&
      position("reconcileAvantiqoExperimentOutcomeAssessorCalibration()") <
        position("reconcileAvantiqoExperimentEstimatorCalibration()"),
  ],
  [
    "cron runs secondary guard before execution requests",
    position("reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard()") >= 0 &&
      position("reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard()") <
        position("reconcileAvantiqoExperimentExecutionRequests()"),
  ],
  [
    "assessor runtime exported",
    index.includes("./runtime/AvantiqoExperimentOutcomeAssessorCalibrationRuntime"),
  ],
  [
    "assessor selection guard exported",
    index.includes("./runtime/AvantiqoAssessorCalibratedEstimatorSelectionGuardRuntime"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [name] of failures) {
    console.error(`AVANTIQO_PHASE22_AUDIT_FAILURE=${name}`);
  }
  process.exitCode = 1;
} else {
  console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE22_AUDIT=PASS");
  console.log(
    "AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_CONTRACT=AVANTIQO_EXPERIMENT_OUTCOME_ASSESSOR_CALIBRATION_V1",
  );
  console.log(
    "AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_CONTRACT=AVANTIQO_ASSESSOR_CALIBRATED_ESTIMATOR_SELECTION_GUARD_V1",
  );
  console.log("AVANTIQO_PHASE22_LEAVE_ONE_OUT_SELF_CALIBRATION=false");
  console.log("AVANTIQO_PHASE22_MIN_PEER_ASSESSORS=2");
  console.log("AVANTIQO_PHASE22_MIN_PEER_METHODS=2");
  console.log("AVANTIQO_PHASE22_TRUSTED_EVENT_MIN_ASSESSORS=3");
  console.log("AVANTIQO_PHASE22_QUARANTINED_ASSESSOR_CAN_ENABLE_QUALIFICATION=false");
  console.log("AVANTIQO_PHASE22_CALIBRATION_CAN_IMPROVE_SELECTION_SCORE=false");
  console.log("AVANTIQO_PHASE22_EXECUTION_AUTHORIZED=false");
  console.log("AVANTIQO_PHASE22_PLATFORM_KNOWLEDGE_WRITTEN=false");
  console.log("AVANTIQO_PHASE22_AUTOMATIC_TRAINING_STARTED=false");
}
