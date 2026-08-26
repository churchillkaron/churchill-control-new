import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const calibrationPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoExperimentEstimatorCalibrationRuntime.js",
);
const guardPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoEstimatorCalibratedSelectionGuardRuntime.js",
);
const selectorPath = path.join(
  root,
  "lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime.js",
);
const routePath = path.join(
  root,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);
const indexPath = path.join(root, "lib/intelligence/index.js");

const calibration = fs.readFileSync(calibrationPath, "utf8");
const guard = fs.readFileSync(guardPath, "utf8");
const selector = fs.readFileSync(selectorPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");

const calibrationCall = route.indexOf(
  "reconcileAvantiqoExperimentEstimatorCalibration()",
);
const selectionCall = route.indexOf("reconcileAvantiqoActiveExperimentSelection()");
const guardCall = route.indexOf(
  "reconcileAvantiqoEstimatorCalibratedSelectionGuard()",
);
const requestCall = route.indexOf(
  "reconcileAvantiqoExperimentExecutionRequests()",
);

const checks = [
  [
    "calibration contract",
    calibration.includes("AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1"),
  ],
  [
    "guard contract",
    guard.includes("AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_V1"),
  ],
  [
    "phase17 estimate lineage",
    calibration.includes("platform_learning_experiment_information_estimates") &&
      calibration.includes("AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1"),
  ],
  [
    "phase20 immutable receipt lineage",
    calibration.includes("platform_learning_experiment_execution_receipts") &&
      calibration.includes("AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1") &&
      calibration.includes("immutable_provenance_record !== true"),
  ],
  [
    "governed result evidence required for uncertainty assessment",
    calibration.includes("GOVERNED_RESULT_EVIDENCE_REQUIRED") &&
      calibration.includes("governed_result_evidence_verified: true"),
  ],
  [
    "two independent outcome assessors required",
    calibration.includes("const MIN_INDEPENDENT_OUTCOME_ASSESSORS = 2") &&
      calibration.includes(
        "assessorFingerprints.length >= MIN_INDEPENDENT_OUTCOME_ASSESSORS",
      ),
  ],
  [
    "two outcome assessment methods required",
    calibration.includes("const MIN_OUTCOME_ASSESSMENT_METHODS = 2") &&
      calibration.includes(
        "methodFingerprints.length >= MIN_OUTCOME_ASSESSMENT_METHODS",
      ),
  ],
  [
    "single outcome assessment is not ground truth",
    calibration.includes("assessment_is_not_ground_truth_by_itself: true") &&
      calibration.includes("assessment_is_ground_truth_by_itself: false"),
  ],
  [
    "information gain never inferred from receipt or result text",
    calibration.includes(
      "information_gain_not_inferred_from_receipt_or_result_text: true",
    ) &&
      calibration.includes(
        "information_gain_inferred_from_receipt_or_result_text: false",
      ),
  ],
  [
    "objective cost calibration",
    calibration.includes("cost_underestimate_ratio") &&
      calibration.includes("cost_underestimated_beyond_tolerance") &&
      calibration.includes("COST_UNDERESTIMATE_TOLERANCE"),
  ],
  [
    "objective risk calibration",
    calibration.includes("risk_brier_score") &&
      calibration.includes("low_risk_failure") &&
      calibration.includes("LOW_RISK_FAILURE_THRESHOLD"),
  ],
  [
    "mature calibration requires repeated evidence",
    calibration.includes("const MIN_CALIBRATION_EVENTS = 3") &&
      calibration.includes("const MIN_DISTINCT_EXPERIMENTS = 2"),
  ],
  [
    "information calibration requires repeated evidence",
    calibration.includes("const MIN_INFORMATION_GAIN_EVENTS = 3"),
  ],
  [
    "unsafe optimism quarantine",
    calibration.includes("QUARANTINED_UNSAFE_OPTIMISM") &&
      calibration.includes("unsafe_cost_optimism") &&
      calibration.includes("unsafe_risk_optimism") &&
      calibration.includes("unsafe_information_gain_optimism"),
  ],
  [
    "self reported confidence cannot override calibration",
    calibration.includes("self_reported_confidence_cannot_override_calibration: true") &&
      calibration.includes("self_reported_confidence_overrides_calibration: false"),
  ],
  [
    "calibration cannot improve score",
    calibration.includes("calibration_never_improves_estimate_score: true") &&
      calibration.includes("calibration_can_improve_estimate_score: false"),
  ],
  [
    "quarantined estimates retained numerically",
    calibration.includes(
      "quarantined_estimates_must_remain_in_conservative_numeric_aggregation",
    ) &&
      guard.includes("original_estimate_values_are_mutated: false"),
  ],
  [
    "quarantined estimators excluded from qualification",
    guard.includes("quarantined_estimators_count_for_qualification: false") &&
      guard.includes("non_quarantined_estimator_count") &&
      guard.includes("non_quarantined_method_count"),
  ],
  [
    "guard still requires two independent estimators",
    guard.includes("const MIN_INDEPENDENT_ESTIMATORS = 2"),
  ],
  [
    "guard still requires two methods",
    guard.includes("const MIN_ESTIMATION_METHODS = 2"),
  ],
  [
    "guard can only retire selection",
    guard.includes("calibration_can_only_retire_selection: true") &&
      guard.includes("calibration_action_is_fail_closed_retirement_only: true") &&
      guard.includes("active: false"),
  ],
  [
    "guard before execution request generation",
    guard.includes("fail_closed_before_execution_request_generation: true") &&
      calibrationCall >= 0 &&
      selectionCall > calibrationCall &&
      guardCall > selectionCall &&
      requestCall > guardCall,
  ],
  [
    "phase17 remains conservative numeric selector",
    selector.includes("scoring_uses_lowest_information_gain_estimate: true") &&
      selector.includes("scoring_uses_highest_cost_estimate: true") &&
      selector.includes("scoring_uses_highest_execution_risk_estimate: true"),
  ],
  [
    "cron returns estimator calibration",
    route.includes("experiment_estimator_calibration: experimentEstimatorCalibration"),
  ],
  [
    "cron returns calibrated guard",
    route.includes(
      "estimator_calibrated_selection_guard: estimatorCalibratedSelectionGuard",
    ),
  ],
  [
    "cron does not self-grade uncertainty outcomes",
    !route.includes("recordAvantiqoExperimentInformationOutcomeAssessment"),
  ],
  [
    "cron does not execute claims or receipts",
    !route.includes("createAvantiqoExperimentExecutionClaim") &&
      !route.includes("consumeAvantiqoExperimentExecutionClaim") &&
      !route.includes("recordAvantiqoExperimentExecutionReceipt"),
  ],
  [
    "calibration no execution authority",
    calibration.includes("execution_authorized: false") &&
      calibration.includes("spend_authorized: false") &&
      calibration.includes("provider_execution_authorized: false") &&
      calibration.includes("runpod_job_submitted: false"),
  ],
  [
    "guard no execution authority",
    guard.includes("execution_authorized: false") &&
      guard.includes("spend_authorized: false") &&
      guard.includes("provider_execution_authorized: false") &&
      guard.includes("runpod_job_submitted: false"),
  ],
  [
    "no platform knowledge or training",
    calibration.includes("platform_knowledge_written: false") &&
      calibration.includes("automatic_training_started: false") &&
      guard.includes("platform_knowledge_written: false") &&
      guard.includes("automatic_training_started: false"),
  ],
  [
    "calibration runtime exported",
    index.includes("./runtime/AvantiqoExperimentEstimatorCalibrationRuntime"),
  ],
  [
    "calibrated guard exported",
    index.includes("./runtime/AvantiqoEstimatorCalibratedSelectionGuardRuntime"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
if (failures.length) {
  for (const [name] of failures) {
    console.error(`AVANTIQO_PHASE21_AUDIT_FAILURE=${name}`);
  }
  process.exitCode = 1;
} else {
  console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE21_AUDIT=PASS");
  console.log(
    "AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT=AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1",
  );
  console.log(
    "AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_CONTRACT=AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_V1",
  );
  console.log("AVANTIQO_PHASE21_MIN_CALIBRATION_EVENTS=3");
  console.log("AVANTIQO_PHASE21_MIN_DISTINCT_EXPERIMENTS=2");
  console.log("AVANTIQO_PHASE21_MIN_OUTCOME_ASSESSORS=2");
  console.log("AVANTIQO_PHASE21_MIN_OUTCOME_METHODS=2");
  console.log("AVANTIQO_PHASE21_CALIBRATION_CAN_IMPROVE_SCORE=false");
  console.log(
    "AVANTIQO_PHASE21_QUARANTINED_ESTIMATORS_COUNT_FOR_QUALIFICATION=false",
  );
  console.log("AVANTIQO_PHASE21_EXECUTION_AUTHORIZED=false");
  console.log("AVANTIQO_PHASE21_PLATFORM_KNOWLEDGE_WRITTEN=false");
}
