import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT =
  "AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function requireFingerprint(value, code) {
  const fingerprint = text(value, 128).toLowerCase();
  if (!/^[a-f0-9]{32,128}$/.test(fingerprint)) {
    throw new Error(`${AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT}_${code}_INVALID`);
  }
  return fingerprint;
}

function requireReason(value, code) {
  const reason = text(value, 4000);
  if (reason.length < 12) {
    throw new Error(`${AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT}_${code}_REQUIRED`);
  }
  return reason;
}

function requireInfluence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 0.25) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT}_INFLUENCE_INVALID`,
    );
  }
  return number;
}

export async function activateAvantiqoPersistentOrderingPolicy({
  release_candidate_fingerprint,
  activator_fingerprint,
  activation_reason,
  exact_certified_ordering_influence_fraction,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const releaseCandidateFingerprint = requireFingerprint(
    release_candidate_fingerprint,
    "RELEASE_CANDIDATE_FINGERPRINT",
  );
  const activatorFingerprint = requireFingerprint(
    activator_fingerprint,
    "ACTIVATOR_FINGERPRINT",
  );
  const reason = requireReason(activation_reason, "ACTIVATION_REASON");
  const influence = requireInfluence(
    exact_certified_ordering_influence_fraction,
  );

  const result = await supabaseAdmin.rpc(
    "activate_avantiqo_intelligence_persistent_ordering_policy_v1",
    {
      p_organization_id: organizationId,
      p_release_candidate_fingerprint: releaseCandidateFingerprint,
      p_activator_fingerprint: activatorFingerprint,
      p_activation_reason: reason,
      p_expected_influence_fraction: influence,
    },
  );
  if (result.error) throw result.error;

  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT,
    status: "EXPLICIT_PERSISTENT_ORDERING_POLICY_ACTIVATION_RECORDED",
    policy: result.data,
    exact_certified_influence_preserved: true,
    candidate_membership_change_authorized: false,
    source_numeric_score_mutation_authorized: false,
    execution_authorized: false,
    automatic_activation: false,
  };
}

export async function reconcileAvantiqoPersistentOrderingPolicyApplication() {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      application_performed: false,
      live_policy_active: false,
    };
  }

  const result = await supabaseAdmin.rpc(
    "apply_avantiqo_intelligence_persistent_ordering_policy_v1",
    { p_organization_id: organizationId },
  );
  if (result.error) throw result.error;
  const payload = result.data && typeof result.data === "object" ? result.data : {};
  return {
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT,
    ...payload,
    automatic_activation: false,
    candidate_membership_change_authorized: false,
    source_numeric_score_mutation_authorized: false,
    execution_authorized: false,
  };
}

export async function rollbackAvantiqoPersistentOrderingPolicy({
  policy_fingerprint,
  rollback_actor_fingerprint,
  rollback_reason,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const policyFingerprint = requireFingerprint(
    policy_fingerprint,
    "POLICY_FINGERPRINT",
  );
  const rollbackActorFingerprint = requireFingerprint(
    rollback_actor_fingerprint,
    "ROLLBACK_ACTOR_FINGERPRINT",
  );
  const reason = requireReason(rollback_reason, "ROLLBACK_REASON");

  const result = await supabaseAdmin.rpc(
    "rollback_avantiqo_intelligence_persistent_ordering_policy_v1",
    {
      p_organization_id: organizationId,
      p_policy_fingerprint: policyFingerprint,
      p_rollback_actor_fingerprint: rollbackActorFingerprint,
      p_rollback_reason: reason,
    },
  );
  if (result.error) throw result.error;

  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT,
    status: "PERSISTENT_ORDERING_POLICY_ROLLBACK_RECORDED",
    policy: result.data,
    exact_baseline_restoration_required: true,
    candidate_membership_changed: false,
    source_numeric_scores_mutated: false,
    execution_authorized: false,
  };
}

export const AvantiqoPersistentOrderingPolicyAuthorityRuntime = Object.freeze({
  contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_CONTRACT,
  activate: activateAvantiqoPersistentOrderingPolicy,
  reconcileApplication: reconcileAvantiqoPersistentOrderingPolicyApplication,
  rollback: rollbackAvantiqoPersistentOrderingPolicy,
});
