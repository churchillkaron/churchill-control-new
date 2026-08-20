import {
  resolveOperatorBusinessRead,
} from "./OperatorBusinessReadResolver";

const ATTENTION_KEY = "platform.attention.scan";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedMode(value) {
  return text(value).toLowerCase();
}

function requiredFields(capability = {}) {
  const required = capability?.input_schema?.required;
  return Array.isArray(required) ? required.map(text).filter(Boolean) : [];
}

function schemaIsAutomatic(capability) {
  return requiredFields(capability).length === 0;
}

function entityRequired(capability, entityId) {
  return normalizedMode(capability?.context_scope) === "entity" && !text(entityId);
}

function isAttentionReflexMatch(entry) {
  const phraseAffinity = Number(entry?.phrase_affinity || 0);
  const primaryCoverage = Number(entry?.primary_coverage || 0);
  const score = Number(entry?.score || 0);

  return (
    phraseAffinity >= 0.72 ||
    (primaryCoverage >= 0.52 && score >= 0.34)
  );
}

export function resolveOperatorBusinessDataReflex({
  message,
  capabilities = [],
  entityId = null,
} = {}) {
  const resolution = resolveOperatorBusinessRead({
    message,
    capabilities,
    limit: 8,
  });

  if (!resolution?.capabilities?.length) return null;

  const candidates = list(resolution.capabilities).filter(
    (capability) =>
      normalizedMode(capability?.mode) === "read" &&
      capability?.auto_execute !== false &&
      capability?.requires_confirmation !== true &&
      schemaIsAutomatic(capability),
  );

  const attentionCapability = candidates.find(
    (candidate) => text(candidate?.key) === ATTENTION_KEY,
  );
  const attentionRankedEntry = list(resolution.ranked).find(
    (entry) => text(entry?.capability_key) === ATTENTION_KEY,
  );
  const capability =
    attentionCapability && isAttentionReflexMatch(attentionRankedEntry)
      ? attentionCapability
      : candidates[0] || null;
  if (!capability) return null;

  const rankedEntry = list(resolution.ranked).find(
    (entry) => text(entry?.capability_key) === text(capability?.key),
  );
  const score = Number(rankedEntry?.score || 0);
  const separation = Number(resolution.separation || 0);

  const clearPhrase = Number(rankedEntry?.phrase_affinity || 0) >= 0.78;
  const clearCoverage =
    Number(rankedEntry?.primary_coverage || 0) >= 0.55 &&
    (separation >= 0.12 || resolution.capabilities.length === 1);
  const clearAttention =
    text(capability?.key) === ATTENTION_KEY &&
    isAttentionReflexMatch(rankedEntry);

  if (!clearPhrase && !clearCoverage && !clearAttention) return null;

  if (entityRequired(capability, entityId)) {
    return {
      matched: true,
      execute: false,
      reason: "ENTITY_CONTEXT_REQUIRED",
      response_text: "Which legal entity should I use for this request?",
    };
  }

  return {
    matched: true,
    execute: true,
    confidence: Math.max(0.9, Math.min(0.99, Number(resolution.confidence || score))),
    capability,
    capability_key: capability.key,
    payload: {},
    reason: `Registry-resolved read: ${capability.key}`,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "registry-data-reflex-v2",
      usage_id: null,
    },
  };
}

export default resolveOperatorBusinessDataReflex;
