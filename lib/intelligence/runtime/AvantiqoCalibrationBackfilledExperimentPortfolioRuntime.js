import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  reconcileAvantiqoActiveExperimentSelection,
} from "@/lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime";
import {
  reconcileAvantiqoEstimatorCalibratedSelectionGuard,
} from "@/lib/intelligence/runtime/AvantiqoEstimatorCalibratedSelectionGuardRuntime";
import {
  reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard,
} from "@/lib/intelligence/runtime/AvantiqoAssessorCalibratedEstimatorSelectionGuardRuntime";

export const AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT =
  "AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_V1";

const MEMORY_TABLE = "intelligence_memories";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const ESTIMATE_SCOPE = "platform_learning_experiment_information_estimates";
const MAX_SELECTIONS_PER_CYCLE = 3;
const ABSOLUTE_MAX_BACKFILL_PASSES = 64;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

async function loadActiveSelectionVersionSet(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("active", true)
    .limit(100);
  if (result.error) throw result.error;
  return new Set(
    list(result.data)
      .map((row) => text(object(row.metadata).experiment_version_fingerprint, 128))
      .filter(Boolean),
  );
}

async function retireCalibrationRejectedEstimateEvidence(
  organizationId,
  experimentVersionFingerprints,
  pass,
) {
  const versions = [...new Set(list(experimentVersionFingerprints).map((value) => text(value, 128)).filter(Boolean))];
  if (!versions.length) return 0;

  const nowIso = new Date().toISOString();
  let retired = 0;
  for (const version of versions) {
    const current = await supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("memory_scope", ESTIMATE_SCOPE)
      .eq("active", true)
      .eq("metadata->>experiment_version_fingerprint", version)
      .limit(1000);
    if (current.error) throw current.error;

    for (const row of list(current.data)) {
      const metadata = object(row.metadata);
      const result = await supabaseAdmin
        .from(MEMORY_TABLE)
        .update({
          active: false,
          forgotten_at: nowIso,
          updated_at: nowIso,
          metadata: {
            ...metadata,
            phase26_contract:
              AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT,
            phase26_status: "ESTIMATE_EVIDENCE_RETIRED_AFTER_CALIBRATION_REJECTION",
            phase26_experiment_version_fingerprint: version,
            phase26_backfill_pass: pass,
            phase26_retired_at: nowIso,
            phase26_original_numeric_estimate_values_mutated: false,
            phase26_estimate_no_longer_counts_for_selection: true,
            execution_authorized: false,
            spend_authorized: false,
            provider_execution_authorized: false,
          },
        })
        .eq("id", row.id)
        .eq("active", true)
        .select("id");
      if (result.error) throw result.error;
      if (list(result.data).length === 1) retired += 1;
    }
  }
  return retired;
}

async function retireActiveSelectionsFailClosed(organizationId, reason) {
  const nowIso = new Date().toISOString();
  const current = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("active", true)
    .limit(100);
  if (current.error) throw current.error;

  let retired = 0;
  for (const row of list(current.data)) {
    const metadata = object(row.metadata);
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        forgotten_at: nowIso,
        updated_at: nowIso,
        metadata: {
          ...metadata,
          phase26_contract:
            AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT,
          phase26_status: "RETIRED_FAIL_CLOSED_BACKFILL_DID_NOT_CONVERGE",
          phase26_reason: reason,
          phase26_retired_at: nowIso,
          selection_execution_authority_remaining: false,
        },
      })
      .eq("id", row.id)
      .eq("active", true)
      .select("id");
    if (result.error) throw result.error;
    if (list(result.data).length === 1) retired += 1;
  }
  return retired;
}

function safePassLimit(candidateCount) {
  const required = Math.ceil(Math.max(0, Number(candidateCount) || 0) / MAX_SELECTIONS_PER_CYCLE) + 2;
  return Math.max(2, Math.min(ABSOLUTE_MAX_BACKFILL_PASSES, required));
}

export async function reconcileAvantiqoCalibrationBackfilledExperimentPortfolio({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      stable_safe_portfolio: false,
      execution_request_generation_allowed: false,
      selected_count: 0,
      excluded_experiment_version_count: 0,
      backfill_pass_count: 0,
    };
  }

  if (persist !== true) {
    return {
      success: true,
      contract: AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT,
      status: "DRY_RUN_REQUIRES_NO_SELECTION_MUTATION",
      stable_safe_portfolio: false,
      execution_request_generation_allowed: false,
      selected_count: 0,
      excluded_experiment_version_count: 0,
      backfill_pass_count: 0,
      governance: {
        execution_authorized: false,
        spend_authorized: false,
        provider_execution_authorized: false,
        runpod_job_submitted: false,
        platform_knowledge_written: false,
        automatic_training_started: false,
        authorization_effect: "NONE",
      },
    };
  }

  const excludedVersions = new Set();
  const passes = [];
  let passLimit = 2;
  let finalSelection = null;
  let finalEstimatorGuard = null;
  let finalAssessorGuard = null;
  let totalRetiredEstimateEvidenceCount = 0;

  for (let pass = 1; pass <= passLimit; pass += 1) {
    const selection = await reconcileAvantiqoActiveExperimentSelection({ persist: true });
    if (pass === 1) passLimit = safePassLimit(selection.candidate_count);

    const estimatorGuard = await reconcileAvantiqoEstimatorCalibratedSelectionGuard({
      persist: true,
    });
    const assessorGuard =
      await reconcileAvantiqoAssessorCalibratedEstimatorSelectionGuard({
        persist: true,
      });

    const activeVersions = await loadActiveSelectionVersionSet(organizationId);
    const failedVersions = list(selection.selected_experiments)
      .map((item) => text(item.experiment_version_fingerprint, 128))
      .filter((version) => version && !activeVersions.has(version));
    for (const version of failedVersions) excludedVersions.add(version);

    const retiredEstimateEvidenceCount =
      await retireCalibrationRejectedEstimateEvidence(
        organizationId,
        failedVersions,
        pass,
      );
    totalRetiredEstimateEvidenceCount += retiredEstimateEvidenceCount;

    passes.push({
      pass,
      selected_count: Number(selection.selected_count) || 0,
      estimator_guard_retired_count:
        Number(estimatorGuard.retired_selection_count) || 0,
      assessor_guard_retired_count:
        Number(assessorGuard.retired_selection_count) || 0,
      newly_excluded_experiment_version_count: failedVersions.length,
      retired_estimate_evidence_count: retiredEstimateEvidenceCount,
      cumulative_excluded_experiment_version_count: excludedVersions.size,
    });

    finalSelection = selection;
    finalEstimatorGuard = estimatorGuard;
    finalAssessorGuard = assessorGuard;

    if (failedVersions.length === 0) {
      return {
        success: true,
        contract: AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT,
        status: selection.selected_count > 0
          ? "STABLE_SAFE_EXPERIMENT_PORTFOLIO_READY"
          : "NO_SAFE_EXPERIMENT_PORTFOLIO_AVAILABLE",
        stable_safe_portfolio: true,
        execution_request_generation_allowed: selection.selected_count > 0,
        selected_count: Number(selection.selected_count) || 0,
        selected_experiments: list(selection.selected_experiments),
        candidate_count: Number(selection.candidate_count) || 0,
        estimate_qualified_candidate_count:
          Number(selection.estimate_qualified_candidate_count) || 0,
        excluded_experiment_version_count: excludedVersions.size,
        excluded_experiment_version_fingerprints: [...excludedVersions],
        retired_estimate_evidence_count: totalRetiredEstimateEvidenceCount,
        backfill_pass_count: pass,
        backfill_pass_limit: passLimit,
        passes,
        final_active_experiment_selection: selection,
        final_estimator_calibrated_selection_guard: estimatorGuard,
        final_assessor_calibrated_estimator_selection_guard: assessorGuard,
        policy: {
          maximum_selections_per_cycle: MAX_SELECTIONS_PER_CYCLE,
          failed_calibration_versions_are_excluded_within_same_cycle: true,
          lower_ranked_candidates_backfill_vacated_slots: true,
          rejected_estimate_values_are_numerically_mutated: false,
          rejected_estimate_evidence_is_retired_from_future_selection: true,
          fresh_independent_estimate_evidence_can_requalify_later: true,
          estimator_guard_math_duplicated_here: false,
          assessor_guard_math_duplicated_here: false,
          execution_requests_wait_for_stable_portfolio: true,
          backfill_is_version_specific: true,
          unsafe_version_automatic_reactivation_same_cycle: false,
          fail_closed_on_non_convergence: true,
        },
        governance: {
          execution_authorized: false,
          spend_authorized: false,
          provider_execution_authorized: false,
          experiment_execution_performed_here: false,
          runpod_job_submitted: false,
          runpod_endpoint_mutated: false,
          wallet_write_performed_here: false,
          platform_knowledge_written: false,
          reusable_platform_knowledge_created: false,
          automatic_knowledge_promotion: false,
          automatic_training_started: false,
          automatic_model_weight_mutation: false,
          authorization_effect: "NONE",
        },
      };
    }
  }

  const retiredFailClosed = await retireActiveSelectionsFailClosed(
    organizationId,
    "BACKFILL_PASS_LIMIT_REACHED",
  );
  return {
    success: false,
    contract: AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT,
    status: "BACKFILL_DID_NOT_CONVERGE_FAIL_CLOSED",
    stable_safe_portfolio: false,
    execution_request_generation_allowed: false,
    selected_count: 0,
    excluded_experiment_version_count: excludedVersions.size,
    excluded_experiment_version_fingerprints: [...excludedVersions],
    retired_estimate_evidence_count: totalRetiredEstimateEvidenceCount,
    backfill_pass_count: passes.length,
    backfill_pass_limit: passLimit,
    fail_closed_selection_retirement_count: retiredFailClosed,
    passes,
    final_active_experiment_selection: finalSelection,
    final_estimator_calibrated_selection_guard: finalEstimatorGuard,
    final_assessor_calibrated_estimator_selection_guard: finalAssessorGuard,
    governance: {
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      wallet_write_performed_here: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoCalibrationBackfilledExperimentPortfolioRuntime = Object.freeze({
  contract: AVANTIQO_CALIBRATION_BACKFILLED_EXPERIMENT_PORTFOLIO_CONTRACT,
  reconcile: reconcileAvantiqoCalibrationBackfilledExperimentPortfolio,
  maximumBackfillPasses: ABSOLUTE_MAX_BACKFILL_PASSES,
});
