import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT =
  "AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1";
export const AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_CONTRACT =
  "AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_V1";
export const AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_CONTRACT =
  "AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_V1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function validIso(value, code) {
  const candidate = text(value, 160);
  const parsed = Date.parse(candidate);
  if (!candidate || !Number.isFinite(parsed)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT}_${code}_INVALID`);
  }
  return new Date(parsed).toISOString();
}

function normalizedBinding(payload) {
  const data = object(payload);
  const kind = text(data.attribution_kind, 80);
  if (kind === "NO_PERSISTENT_POLICY_INTERVAL") {
    return {
      contract: AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
      attribution_kind: kind,
      persistent_policy_interval_present: false,
      policy_id: null,
      policy_fingerprint: null,
      activation_generation_index: null,
      activation_generation_fingerprint: null,
      activation_started_at: null,
      activation_closed_at: null,
      event_at: validIso(data.event_at, "EVENT_AT"),
      exact_interval_resolution: data.exact_interval_resolution === true,
    };
  }
  if (kind !== "PERSISTENT_POLICY_INTERVAL") {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT}_ATTRIBUTION_KIND_INVALID`,
    );
  }
  const generationIndex = Number(data.activation_generation_index);
  const generationFingerprint = text(data.activation_generation_fingerprint, 128).toLowerCase();
  const policyFingerprint = text(data.policy_fingerprint, 128).toLowerCase();
  const policyId = text(data.policy_id, 80);
  if (
    !policyId ||
    !/^[a-f0-9]{32,128}$/.test(policyFingerprint) ||
    !Number.isInteger(generationIndex) ||
    generationIndex <= 0 ||
    !/^[a-f0-9]{32,128}$/.test(generationFingerprint)
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT}_PERSISTENT_BINDING_INVALID`,
    );
  }
  return {
    contract: AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
    attribution_kind: kind,
    persistent_policy_interval_present: true,
    policy_id: policyId,
    policy_fingerprint: policyFingerprint,
    activation_generation_index: generationIndex,
    activation_generation_fingerprint: generationFingerprint,
    activation_started_at: validIso(data.activation_started_at, "ACTIVATION_STARTED_AT"),
    activation_closed_at: data.activation_closed_at
      ? validIso(data.activation_closed_at, "ACTIVATION_CLOSED_AT")
      : null,
    event_at: validIso(data.event_at, "EVENT_AT"),
    exact_interval_resolution: data.exact_interval_resolution === true,
  };
}

export function policyIntervalBindingFromMetadata(metadata) {
  const source = object(metadata);
  const kind = text(source.policy_activation_binding_kind, 80);
  if (!kind) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT}_BINDING_METADATA_MISSING`,
    );
  }
  return normalizedBinding({
    attribution_kind: kind,
    persistent_policy_interval_present:
      source.policy_activation_binding_persistent_policy_present === true,
    policy_id: source.policy_id,
    policy_fingerprint: source.policy_fingerprint,
    activation_generation_index: source.activation_generation_index,
    activation_generation_fingerprint: source.activation_generation_fingerprint,
    activation_started_at: source.policy_activation_started_at,
    activation_closed_at: source.policy_activation_closed_at,
    event_at: source.policy_activation_binding_observed_at,
    exact_interval_resolution:
      source.policy_activation_binding_exact_interval_resolution === true,
  });
}

export function policyIntervalBindingMetadata(binding) {
  const normalized = normalizedBinding(binding);
  return {
    policy_activation_binding_contract:
      AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_CONTRACT,
    policy_activation_resolution_contract:
      AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
    policy_activation_binding_kind: normalized.attribution_kind,
    policy_activation_binding_persistent_policy_present:
      normalized.persistent_policy_interval_present,
    policy_id: normalized.policy_id,
    policy_fingerprint: normalized.policy_fingerprint,
    activation_generation_index: normalized.activation_generation_index,
    activation_generation_fingerprint:
      normalized.activation_generation_fingerprint,
    policy_activation_started_at: normalized.activation_started_at,
    policy_activation_closed_at: normalized.activation_closed_at,
    policy_activation_binding_observed_at: normalized.event_at,
    policy_activation_binding_exact_interval_resolution:
      normalized.exact_interval_resolution === true,
    policy_activation_binding_is_execution_authority: false,
    cross_interval_policy_binding_reuse_allowed: false,
  };
}

export async function resolveAvantiqoExperimentPolicyIntervalBinding({
  event_at = new Date().toISOString(),
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      binding: {
        contract: AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
        attribution_kind: "NO_PERSISTENT_POLICY_INTERVAL",
        persistent_policy_interval_present: false,
        policy_id: null,
        policy_fingerprint: null,
        activation_generation_index: null,
        activation_generation_fingerprint: null,
        activation_started_at: null,
        activation_closed_at: null,
        event_at: validIso(event_at, "EVENT_AT"),
        exact_interval_resolution: true,
      },
      execution_authorized: false,
    };
  }

  const eventAt = validIso(event_at, "EVENT_AT");
  const result = await supabaseAdmin.rpc(
    "resolve_avantiqo_policy_activation_interval_v1",
    { p_organization_id: organizationId, p_event_at: eventAt },
  );
  if (result.error) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT}_RPC_FAILED_CLOSED:${text(
        result.error.message || result.error.code,
        800,
      )}`,
    );
  }
  const payload = object(result.data);
  if (payload.success !== true || payload.exact_interval_resolution !== true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT}_${text(
        payload.status,
        240,
      ) || "RESOLUTION_FAILED_CLOSED"}`,
    );
  }
  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
    status: text(payload.status, 240),
    binding: normalizedBinding(payload),
    execution_authorized: false,
  };
}

export async function assertAvantiqoExperimentPolicyIntervalBindingAt({
  metadata,
  event_at,
} = {}) {
  const expected = policyIntervalBindingFromMetadata(metadata);
  const resolved = await resolveAvantiqoExperimentPolicyIntervalBinding({
    event_at: event_at || expected.event_at,
  });
  const actual = resolved.binding;
  const same = Boolean(
    expected.attribution_kind === actual.attribution_kind &&
      expected.policy_id === actual.policy_id &&
      expected.policy_fingerprint === actual.policy_fingerprint &&
      expected.activation_generation_index === actual.activation_generation_index &&
      expected.activation_generation_fingerprint ===
        actual.activation_generation_fingerprint &&
      expected.activation_started_at === actual.activation_started_at
  );
  if (!same) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT}_BINDING_STALE_OR_MISMATCH_FAIL_CLOSED`,
    );
  }
  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
    status: "EXACT_POLICY_INTERVAL_BINDING_VERIFIED",
    binding: actual,
    execution_authorized: false,
  };
}

export async function assertAvantiqoExperimentPolicyIntervalBindingCurrent({
  metadata,
} = {}) {
  return assertAvantiqoExperimentPolicyIntervalBindingAt({
    metadata,
    event_at: new Date().toISOString(),
  });
}

export async function verifyAvantiqoExperimentOutcomePolicyIntervalIntegrity() {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      historical_outcome_use_allowed: true,
      research_generation_allowed: true,
      execution_request_generation_allowed: true,
      read_only_integrity_verification: true,
      execution_authorized: false,
    };
  }
  const result = await supabaseAdmin.rpc(
    "verify_avantiqo_policy_outcome_attribution_v1",
    { p_organization_id: organizationId },
  );
  if (result.error) {
    return {
      success: false,
      contract: AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_CONTRACT,
      status: "OUTCOME_POLICY_INTERVAL_INTEGRITY_RPC_FAILED_CLOSED",
      historical_outcome_use_allowed: false,
      research_generation_allowed: false,
      execution_request_generation_allowed: false,
      read_only_integrity_verification: true,
      execution_authorized: false,
      error: text(result.error.message || result.error.code, 1000),
    };
  }
  const payload = object(result.data);
  return {
    ...payload,
    contract:
      text(payload.contract, 180) ||
      AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_CONTRACT,
    success: payload.success === true,
    historical_outcome_use_allowed:
      payload.success === true && payload.historical_outcome_use_allowed !== false,
    research_generation_allowed:
      payload.success === true && payload.research_generation_allowed !== false,
    execution_request_generation_allowed:
      payload.success === true &&
      payload.execution_request_generation_allowed !== false,
    read_only_integrity_verification: true,
    execution_authorized: false,
  };
}

export const AvantiqoExperimentPolicyIntervalAttributionRuntime = Object.freeze({
  resolutionContract: AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_CONTRACT,
  attributionContract:
    AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_CONTRACT,
  integrityContract:
    AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_INTEGRITY_CONTRACT,
  resolve: resolveAvantiqoExperimentPolicyIntervalBinding,
  assertBindingAt: assertAvantiqoExperimentPolicyIntervalBindingAt,
  assertBindingCurrent: assertAvantiqoExperimentPolicyIntervalBindingCurrent,
  verifyOutcomeIntegrity:
    verifyAvantiqoExperimentOutcomePolicyIntervalIntegrity,
});