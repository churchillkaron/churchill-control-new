import { createHash } from "node:crypto";

export const IMPLEMENTATION_REPAIR_RESUME_CONTRACT =
  "AVANTIQO_IMPLEMENTATION_REPAIR_RESUME_V2";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
function bindingProjection({
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

function sha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function implementationRepairResumeFingerprint(options = {}) {
  return sha256(bindingProjection(options));
}
export function buildImplementationRepairResumeBinding({
  organizationId,
  entityId = null,
  periodId = null,
  partyId,
  capabilityKey,
  payload = {},
  reason = null,
  originalMessage = null,
} = {}) {
  const fingerprint = implementationRepairResumeFingerprint({
    organizationId, entityId, periodId, partyId, capabilityKey, payload,
  });
  return {
    contract: IMPLEMENTATION_REPAIR_RESUME_CONTRACT,
    capability_key: text(capabilityKey, 300),
    payload: object(payload),
    reason: text(reason, 1000) || null,
    original_message: text(originalMessage, 4000) || null,
    organization_id: text(organizationId, 160) || null,
    entity_id: text(entityId, 160) || null,
    period_id: text(periodId, 160) || null,
    party_id: text(partyId, 160) || null,
    binding_sha256: fingerprint,
    authorization_source: "EXACT_PRIOR_OPERATOR_EXECUTION_INTENT",
    authorization_effect: "SAME_ACTION_ONLY",
    resume_attempted: false,
  };
}
export function validateImplementationRepairResumeBinding(binding, context = {}) {
  const candidate = object(binding);
  if (text(candidate.contract) !== IMPLEMENTATION_REPAIR_RESUME_CONTRACT) {
    return { valid: false, reason: "IMPLEMENTATION_REPAIR_RESUME_CONTRACT_INVALID" };
  }
  if (candidate.resume_attempted === true) {
    return { valid: false, reason: "IMPLEMENTATION_REPAIR_RESUME_ALREADY_ATTEMPTED" };
  }
  if (text(candidate.authorization_effect) !== "SAME_ACTION_ONLY") {
    return { valid: false, reason: "IMPLEMENTATION_REPAIR_RESUME_AUTHORITY_INVALID" };
  }
  const expected = implementationRepairResumeFingerprint({
    organizationId: context.organizationId,
    entityId: context.entityId,
    periodId: context.periodId,
    partyId: context.partyId,
    capabilityKey: candidate.capability_key,
    payload: candidate.payload,
  });
  if (!candidate.binding_sha256 || candidate.binding_sha256 !== expected) {
    return { valid: false, reason: "IMPLEMENTATION_REPAIR_RESUME_BINDING_MISMATCH" };
  }
  return { valid: true, reason: null };
}
