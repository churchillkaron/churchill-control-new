import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_CONTRACT =
  "AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

export async function reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor() {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      live_policy_active: false,
      automatic_rollback_performed: false,
      execution_request_generation_allowed: true,
    };
  }

  const result = await supabaseAdmin.rpc(
    "monitor_avantiqo_intelligence_persistent_ordering_policy_v1",
    { p_organization_id: organizationId },
  );
  if (result.error) throw result.error;

  const payload =
    result.data && typeof result.data === "object" ? result.data : {};
  const rollbackTriggered =
    payload.automatic_rollback_performed === true ||
    [
      "REGRESSION_ROLLBACK_TRIGGERED",
      "LINEAGE_AMBIGUITY_ROLLBACK_TRIGGERED",
    ].includes(text(payload.status, 180));

  return {
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_CONTRACT,
    ...payload,
    governed_phase28_realized_outcomes_only: true,
    rank_changed_pairs_only: true,
    incomplete_outcomes_cause_rollback: false,
    lineage_ambiguity_causes_rollback: true,
    verified_regression_causes_rollback: true,
    baseline_membership_selector_remains_authority: true,
    selected_membership_change_authorized: false,
    source_numeric_score_mutation_authorized: false,
    provider_execution_authorized: false,
    spend_authorized: false,
    platform_knowledge_written: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
    execution_request_generation_allowed: !rollbackTriggered,
  };
}

export const AvantiqoPersistentOrderingPolicyRegressionMonitorRuntime =
  Object.freeze({
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_CONTRACT,
    reconcile: reconcileAvantiqoPersistentOrderingPolicyRegressionMonitor,
  });
