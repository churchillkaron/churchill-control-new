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

function normalizedPhrase(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function exactSafeActionAliasMatch(message, capabilities = []) {
  const utterance = normalizedPhrase(message);
  if (!utterance) return null;

  const matches = list(capabilities).filter((capability) => {
    const capabilityMode = normalizedMode(capability?.mode);
    if (!["write", "draft"].includes(capabilityMode)) return false;
    if (capability?.auto_execute !== true) return false;
    if (capability?.requires_confirmation === true) return false;
    if (capability?.transactional === true) return false;
    if (capability?.approval) return false;
    if (normalizedMode(capability?.risk) !== "low") return false;
    if (!schemaIsAutomatic(capability)) return false;

    return list(capability?.operator_aliases).some(
      (alias) => normalizedPhrase(alias) === utterance,
    );
  });

  return matches.length === 1 ? matches[0] : null;
}

export function resolveOperatorBusinessDataReflex({
  message,
  capabilities = [],
  entityId = null,
} = {}) {
  const exactAction = exactSafeActionAliasMatch(message, capabilities);
  if (exactAction) {
    if (entityRequired(exactAction, entityId)) {
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
      confidence: 0.99,
      capability: exactAction,
      capability_key: exactAction.key,
      payload: {},
      reason: `Registry-resolved exact safe action alias: ${exactAction.key}`,
      provider_evidence: {
        provider: "avantiqo-local",
        model: "registry-action-alias-reflex-v1",
        usage_id: null,
      },
    };
  }

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