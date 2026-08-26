import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
  AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoExperimentEstimatorCalibrationRuntime";

export const AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_CONTRACT =
  "AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_V1";

const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const MEMORY_TABLE = "intelligence_memories";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const ESTIMATE_SCOPE = "platform_learning_experiment_information_estimates";
const HOLD_SCOPE = "platform_learning_experiment_estimator_calibration_holds";
const MIN_INDEPENDENT_ESTIMATORS = 2;
const MIN_ESTIMATION_METHODS = 2;
const MAX_ROWS = 3000;
const HOLD_VALIDITY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

async function loadState(organizationId) {
  const [selections, estimates, calibrations] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", SELECTION_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", ESTIMATE_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
  ]);
  if (selections.error) throw selections.error;
  if (estimates.error) throw estimates.error;
  if (calibrations.error) throw calibrations.error;
  return {
    selections: list(selections.data),
    estimates: list(estimates.data),
    calibrations: list(calibrations.data),
  };
}

function quarantinedEstimatorSet(calibrationRows, nowMs) {
  const set = new Set();
  for (const row of list(calibrationRows)) {
    const metadata = object(row.metadata);
    if (
      activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) ===
        AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT &&
      text(metadata.status, 180) === "QUARANTINED_UNSAFE_OPTIMISM" &&
      metadata.unsafe_optimism_quarantine_active === true
    ) {
      const estimatorFingerprint = text(metadata.estimator_fingerprint, 128);
      if (estimatorFingerprint) set.add(estimatorFingerprint);
    }
  }
  return set;
}

function selectionAssessment(selection, state, quarantineSet, nowMs) {
  const metadata = object(selection.metadata);
  if (
    !activeAndUnexpired(selection, nowMs) ||
    text(metadata.contract, 180) !== ACTIVE_SELECTION_CONTRACT ||
    text(metadata.status, 180) !==
      "SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW" ||
    metadata.selection_is_not_execution_authorization !== true
  ) {
    return null;
  }

  const estimateFingerprints = new Set(
    unique(metadata.estimate_fingerprints).map((value) => text(value, 128)),
  );
  const versionFingerprint = text(
    metadata.experiment_version_fingerprint,
    128,
  );
  const experimentFingerprint = text(metadata.experiment_fingerprint, 128);
  const estimateRows = state.estimates.filter((row) => {
    const estimateMetadata = object(row.metadata);
    return Boolean(
      activeAndUnexpired(row, nowMs) &&
      estimateFingerprints.has(text(estimateMetadata.estimate_fingerprint, 128)) &&
      text(estimateMetadata.experiment_fingerprint, 128) === experimentFingerprint &&
      text(estimateMetadata.experiment_version_fingerprint, 128) ===
        versionFingerprint &&
      estimateMetadata.independent_estimator_attested === true
    );
  });

  const allEstimatorFingerprints = unique(
    estimateRows.map((row) => object(row.metadata).estimator_fingerprint),
  );
  const quarantinedEstimatorFingerprints = allEstimatorFingerprints.filter((value) =>
    quarantineSet.has(value),
  );
  const nonQuarantinedRows = estimateRows.filter(
    (row) =>
      !quarantineSet.has(text(object(row.metadata).estimator_fingerprint, 128)),
  );
  const nonQuarantinedEstimatorFingerprints = unique(
    nonQuarantinedRows.map((row) => object(row.metadata).estimator_fingerprint),
  );
  const nonQuarantinedMethodFingerprints = unique(
    nonQuarantinedRows.map((row) => object(row.metadata).estimation_method_fingerprint),
  );
  const passes = Boolean(
    nonQuarantinedEstimatorFingerprints.length >= MIN_INDEPENDENT_ESTIMATORS &&
      nonQuarantinedMethodFingerprints.length >= MIN_ESTIMATION_METHODS
  );

  return {
    selection,
    passes,
    selection_fingerprint: text(metadata.selection_fingerprint, 128),
    experiment_fingerprint: experimentFingerprint,
    experiment_version_fingerprint: versionFingerprint,
    all_estimate_count: estimateRows.length,
    all_estimator_count: allEstimatorFingerprints.length,
    quarantined_estimator_fingerprints: quarantinedEstimatorFingerprints,
    non_quarantined_estimator_fingerprints: nonQuarantinedEstimatorFingerprints,
    non_quarantined_method_fingerprints: nonQuarantinedMethodFingerprints,
    non_quarantined_estimator_count: nonQuarantinedEstimatorFingerprints.length,
    non_quarantined_method_count: nonQuarantinedMethodFingerprints.length,
  };
}

function holdRow(organizationId, assessment, nowIso) {
  const holdFingerprint = digest(
    "estimator-calibration-selection-hold",
    assessment.selection_fingerprint,
    assessment.experiment_version_fingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: HOLD_SCOPE,
    memory_key: `estimator-calibration-selection-hold:${holdFingerprint.slice(0, 40)}`,
    memory_type: "lesson",
    subject: `Estimator calibration hold ${assessment.experiment_fingerprint.slice(0, 16)}`,
    content:
      "Active experiment selection retired because calibration removed enough unsafe optimistic estimators that the independent-estimator or method-diversity threshold no longer held. The original numeric estimates remain untouched; calibration cannot improve the experiment score.",
    importance: 0.99,
    confidence: 1,
    source: "estimator_calibrated_selection_guard",
    active: true,
    valid_until: plusDays(nowIso, HOLD_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_CONTRACT,
      calibration_contract: AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_CONTRACT,
      status: "SELECTION_RETIRED_BY_ESTIMATOR_CALIBRATION",
      hold_fingerprint: holdFingerprint,
      selection_fingerprint: assessment.selection_fingerprint,
      experiment_fingerprint: assessment.experiment_fingerprint,
      experiment_version_fingerprint: assessment.experiment_version_fingerprint,
      all_estimate_count: assessment.all_estimate_count,
      all_estimator_count: assessment.all_estimator_count,
      quarantined_estimator_fingerprints:
        assessment.quarantined_estimator_fingerprints,
      non_quarantined_estimator_fingerprints:
        assessment.non_quarantined_estimator_fingerprints,
      non_quarantined_method_fingerprints:
        assessment.non_quarantined_method_fingerprints,
      non_quarantined_estimator_count:
        assessment.non_quarantined_estimator_count,
      non_quarantined_method_count: assessment.non_quarantined_method_count,
      minimum_independent_estimators: MIN_INDEPENDENT_ESTIMATORS,
      minimum_estimation_methods: MIN_ESTIMATION_METHODS,
      quarantined_estimators_do_not_count_for_qualification: true,
      original_estimate_values_mutated: false,
      calibration_can_improve_numeric_score: false,
      calibration_action_is_fail_closed_retirement_only: true,
      selection_execution_authority_remaining: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      raw_reasoning_persisted: false,
      authorization_value: "none",
      held_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function retireSelection(assessment, nowIso) {
  const selection = assessment.selection;
  const metadata = object(selection.metadata);
  const retiredMetadata = {
    ...metadata,
    calibration_guard_contract:
      AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_CONTRACT,
    calibration_guard_status: "RETIRED_INSUFFICIENT_NON_QUARANTINED_ESTIMATORS",
    calibration_guarded_at: nowIso,
    quarantined_estimator_fingerprints:
      assessment.quarantined_estimator_fingerprints,
    calibrated_non_quarantined_estimator_count:
      assessment.non_quarantined_estimator_count,
    calibrated_non_quarantined_method_count:
      assessment.non_quarantined_method_count,
    selection_execution_authority_remaining: false,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      forgotten_at: nowIso,
      metadata: retiredMetadata,
      updated_at: nowIso,
    })
    .eq("id", selection.id)
    .eq("active", true)
    .eq("metadata->>selection_fingerprint", assessment.selection_fingerprint)
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length === 1;
}

async function upsertHolds(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoEstimatorCalibratedSelectionGuard({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      inspected_selection_count: 0,
      retired_selection_count: 0,
    };
  }

  const state = await loadState(organizationId);
  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const quarantineSet = quarantinedEstimatorSet(state.calibrations, nowMs);
  const assessments = state.selections
    .map((selection) => selectionAssessment(selection, state, quarantineSet, nowMs))
    .filter(Boolean);
  const failing = assessments.filter((assessment) => !assessment.passes);
  const holds = failing.map((assessment) => holdRow(organizationId, assessment, nowIso));

  let retiredSelectionCount = 0;
  let holdWriteCount = 0;
  if (persist) {
    for (const assessment of failing) {
      if (await retireSelection(assessment, nowIso)) retiredSelectionCount += 1;
    }
    holdWriteCount = await upsertHolds(holds);
  }

  return {
    success: true,
    contract: AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_CONTRACT,
    status: failing.length
      ? "UNSAFE_OPTIMISM_SELECTIONS_RETIRED"
      : "ACTIVE_SELECTIONS_PASS_ESTIMATOR_CALIBRATION",
    active_quarantined_estimator_count: quarantineSet.size,
    inspected_selection_count: assessments.length,
    passing_selection_count: assessments.length - failing.length,
    failing_selection_count: failing.length,
    retired_selection_count: retiredSelectionCount,
    hold_write_count: holdWriteCount,
    failing_selections: failing.map((assessment) => ({
      selection_fingerprint: assessment.selection_fingerprint,
      experiment_fingerprint: assessment.experiment_fingerprint,
      non_quarantined_estimator_count:
        assessment.non_quarantined_estimator_count,
      non_quarantined_method_count: assessment.non_quarantined_method_count,
      quarantined_estimator_fingerprints:
        assessment.quarantined_estimator_fingerprints,
    })),
    policy: {
      minimum_independent_estimators: MIN_INDEPENDENT_ESTIMATORS,
      minimum_estimation_methods: MIN_ESTIMATION_METHODS,
      quarantined_estimators_count_for_qualification: false,
      original_estimate_values_are_mutated: false,
      calibration_can_improve_numeric_score: false,
      calibration_can_only_retire_selection: true,
      fail_closed_before_execution_request_generation: true,
      automatic_selection_reactivation: false,
    },
    governance: {
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoEstimatorCalibratedSelectionGuardRuntime = Object.freeze({
  contract: AVANTIQO_ESTIMATOR_CALIBRATED_SELECTION_GUARD_CONTRACT,
  reconcile: reconcileAvantiqoEstimatorCalibratedSelectionGuard,
});
