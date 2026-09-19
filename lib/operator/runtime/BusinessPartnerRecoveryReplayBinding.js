import { createHash } from "node:crypto";

export const BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined && typeof value[key] !== "function")
      .map((key) => [key, canonical(value[key])]),
  );
}
function projection({
  organizationId,
  entityId = null,
  periodId = null,
  partyId,
  capabilityKey,
  payload = {},
} = {}) {
  return canonical({
    organization_id: text(organizationId, 160) || null,
    entity_id: text(entityId, 160) || null,
    period_id: text(periodId, 160) || null,
    party_id: text(partyId, 160) || null,
    capability_key: text(capabilityKey, 300) || null,
    payload: object(payload),
  });
}
function fingerprint(options = {}) {
  return createHash("sha256")
    .update(JSON.stringify(projection(options)), "utf8")
    .digest("hex");
}

export function buildBusinessPartnerRecoveryReplayBinding(options = {}) {
  const bound = projection(options);
  if (!bound.organization_id || !bound.party_id || !bound.capability_key) {
    throw new Error("BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_CONTEXT_REQUIRED");
  }
  return {
    contract: BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_CONTRACT,
    ...bound,
    binding_sha256: fingerprint(options),
    authorization_source: "CAPTURED_ORIGINAL_BUSINESS_ACTION",
    authorization_effect: "SAME_ACTION_ONLY",
    replay_attempted: false,
  };
}

export function validateBusinessPartnerRecoveryReplayBinding(
  binding,
  {
    organizationId,
    entityId = null,
    periodId = null,
    partyId,
    capabilityKey = null,
    payload = null,
  } = {},
) {
  const candidate = object(binding);
  if (text(candidate.contract, 180) !== BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_CONTRACT) {
    return { valid: false, reason: "BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_CONTRACT_INVALID" };
  }
  if (candidate.replay_attempted === true) {
    return { valid: false, reason: "BUSINESS_PARTNER_RECOVERY_REPLAY_ALREADY_ATTEMPTED" };
  }
  if (text(candidate.authorization_effect, 80) !== "SAME_ACTION_ONLY") {
    return { valid: false, reason: "BUSINESS_PARTNER_RECOVERY_REPLAY_AUTHORITY_INVALID" };
  }
  const effectiveCapability = text(capabilityKey, 300) || text(candidate.capability_key, 300);
  const effectivePayload = payload === null ? object(candidate.payload) : object(payload);
  const expected = fingerprint({
    organizationId,
    entityId,
    periodId,
    partyId,
    capabilityKey: effectiveCapability,
    payload: effectivePayload,
  });
  if (!candidate.binding_sha256 || candidate.binding_sha256 !== expected) {
    return { valid: false, reason: "BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_MISMATCH" };
  }
  if (text(candidate.capability_key, 300) !== effectiveCapability) {
    return { valid: false, reason: "BUSINESS_PARTNER_RECOVERY_REPLAY_CAPABILITY_MISMATCH" };
  }
  if (JSON.stringify(canonical(candidate.payload)) !== JSON.stringify(canonical(effectivePayload))) {
    return { valid: false, reason: "BUSINESS_PARTNER_RECOVERY_REPLAY_PAYLOAD_MISMATCH" };
  }
  return { valid: true, reason: null };
}

export const BusinessPartnerRecoveryReplayBinding = Object.freeze({
  contract: BUSINESS_PARTNER_RECOVERY_REPLAY_BINDING_CONTRACT,
  build: buildBusinessPartnerRecoveryReplayBinding,
  validate: validateBusinessPartnerRecoveryReplayBinding,
});

export default BusinessPartnerRecoveryReplayBinding;
