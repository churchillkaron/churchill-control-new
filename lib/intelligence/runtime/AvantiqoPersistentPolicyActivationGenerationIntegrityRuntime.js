import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_CONTRACT =
  "AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

export async function verifyAvantiqoPersistentPolicyActivationGenerationIntegrity() {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract:
        AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      persistent_policy_active: false,
      research_generation_allowed: true,
      execution_request_generation_allowed: true,
      read_only_integrity_verification: true,
      activation_generation_ledger_mutation_authorized: false,
      policy_activation_authorized: false,
      policy_promotion_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
    };
  }

  const result = await supabaseAdmin.rpc(
    "verify_avantiqo_policy_activation_generation_v1",
    { p_organization_id: organizationId },
  );

  if (result.error) {
    return {
      success: false,
      contract:
        AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_CONTRACT,
      status: "PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_RPC_FAILED_CLOSED",
      persistent_policy_active: null,
      research_generation_allowed: false,
      execution_request_generation_allowed: false,
      read_only_integrity_verification: true,
      activation_generation_ledger_mutation_authorized: false,
      policy_activation_authorized: false,
      policy_promotion_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      error: text(result.error.message || result.error.code, 1000),
    };
  }

  const payload =
    result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? result.data
      : {};

  return {
    ...payload,
    contract:
      text(payload.contract, 180) ||
      AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_CONTRACT,
    success: payload.success === true,
    research_generation_allowed:
      payload.success === true && payload.research_generation_allowed !== false,
    execution_request_generation_allowed:
      payload.success === true &&
      payload.execution_request_generation_allowed !== false,
    read_only_integrity_verification: true,
    activation_generation_ledger_mutation_authorized: false,
    policy_activation_authorized: false,
    policy_promotion_authorized: false,
    provider_execution_authorized: false,
    spend_authorized: false,
    platform_knowledge_written: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
  };
}

export const AvantiqoPersistentPolicyActivationGenerationIntegrityRuntime =
  Object.freeze({
    contract:
      AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_CONTRACT,
    verify: verifyAvantiqoPersistentPolicyActivationGenerationIntegrity,
  });
