import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  verifyAvantiqoPersistentPolicyActivationIntervalIntegrity,
} from "@/lib/intelligence/runtime/AvantiqoPersistentPolicyActivationIntervalIntegrityRuntime";

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
      historical_interval_attribution_allowed: true,
      research_generation_allowed: true,
      execution_request_generation_allowed: true,
      read_only_integrity_verification: true,
      activation_generation_ledger_mutation_authorized: false,
      activation_interval_closure_mutation_authorized: false,
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
      historical_interval_attribution_allowed: false,
      research_generation_allowed: false,
      execution_request_generation_allowed: false,
      read_only_integrity_verification: true,
      activation_generation_ledger_mutation_authorized: false,
      activation_interval_closure_mutation_authorized: false,
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

  if (payload.success !== true) {
    return {
      ...payload,
      contract:
        text(payload.contract, 180) ||
        AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_CONTRACT,
      success: false,
      historical_interval_attribution_allowed: false,
      research_generation_allowed: false,
      execution_request_generation_allowed: false,
      read_only_integrity_verification: true,
      activation_generation_ledger_mutation_authorized: false,
      activation_interval_closure_mutation_authorized: false,
      policy_activation_authorized: false,
      policy_promotion_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
    };
  }

  const activationIntervalIntegrity =
    await verifyAvantiqoPersistentPolicyActivationIntervalIntegrity();
  const intervalAllowed = Boolean(
    activationIntervalIntegrity.success === true &&
      activationIntervalIntegrity.historical_interval_attribution_allowed !== false &&
      activationIntervalIntegrity.research_generation_allowed !== false &&
      activationIntervalIntegrity.execution_request_generation_allowed !== false,
  );

  return {
    ...payload,
    contract:
      text(payload.contract, 180) ||
      AVANTIQO_PERSISTENT_POLICY_ACTIVATION_GENERATION_INTEGRITY_CONTRACT,
    success: intervalAllowed,
    status: intervalAllowed
      ? text(payload.status, 240) || "PERSISTENT_POLICY_ACTIVATION_GENERATION_VERIFIED"
      : "PERSISTENT_POLICY_ACTIVATION_INTERVAL_INTEGRITY_FAIL_CLOSED",
    historical_interval_attribution_allowed: intervalAllowed,
    research_generation_allowed:
      intervalAllowed && payload.research_generation_allowed !== false,
    execution_request_generation_allowed:
      intervalAllowed && payload.execution_request_generation_allowed !== false,
    activation_interval_integrity: activationIntervalIntegrity,
    read_only_integrity_verification: true,
    activation_generation_ledger_mutation_authorized: false,
    activation_interval_closure_mutation_authorized: false,
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
