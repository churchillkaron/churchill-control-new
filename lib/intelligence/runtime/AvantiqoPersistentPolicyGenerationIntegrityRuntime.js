import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_CONTRACT =
  "AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

export async function verifyAvantiqoPersistentPolicyGenerationIntegrity() {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      compacted_successor_active: false,
      execution_request_generation_allowed: true,
      read_only_integrity_verification: true,
      provider_execution_authorized: false,
      spend_authorized: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
    };
  }

  const result = await supabaseAdmin.rpc(
    "verify_avantiqo_persistent_policy_generation_v1",
    { p_organization_id: organizationId },
  );

  if (result.error) {
    return {
      success: false,
      contract: AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_CONTRACT,
      status: "PERSISTENT_POLICY_GENERATION_INTEGRITY_RPC_FAILED_CLOSED",
      error: text(result.error.message || result.error, 1000),
      execution_request_generation_allowed: false,
      read_only_integrity_verification: true,
      provider_execution_authorized: false,
      spend_authorized: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
    };
  }

  const payload =
    result.data && typeof result.data === "object" ? result.data : {};
  const verified =
    payload.success !== false &&
    payload.execution_request_generation_allowed !== false;

  return {
    contract: AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_CONTRACT,
    ...payload,
    success: verified,
    execution_request_generation_allowed: verified,
    read_only_integrity_verification: true,
    active_scoring_state_constant_size:
      payload.compacted_successor_active === true
        ? payload.active_scoring_state_constant_size === true
        : true,
    unbounded_active_layer_accumulation_authorized: false,
    generation_ledger_mutation_authorized: false,
    policy_activation_authorized: false,
    policy_promotion_authorized: false,
    provider_execution_authorized: false,
    spend_authorized: false,
    platform_knowledge_written: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
  };
}

export const AvantiqoPersistentPolicyGenerationIntegrityRuntime = Object.freeze({
  contract: AVANTIQO_PERSISTENT_POLICY_GENERATION_INTEGRITY_CONTRACT,
  verify: verifyAvantiqoPersistentPolicyGenerationIntegrity,
});
