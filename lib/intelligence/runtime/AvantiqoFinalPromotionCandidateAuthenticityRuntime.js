import {
  createHash,
  createHmac,
  createSecretKey,
  timingSafeEqual,
} from "node:crypto";

export const AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT =
  "AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_V1";

export const AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ALGORITHM =
  "HMAC-SHA256";

export const AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT =
  "AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_V1";

const ACTIVE_KEY_ID_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_ACTIVE_KEY_ID";
const KEYRING_JSON_ENV = "AVANTIQO_MISSION_OUTCOME_AUTH_KEYRING_JSON";
const FINAL_CANDIDATE_SCOPE = "platform_learning_knowledge_final_promotion_candidates";
const FINAL_CANDIDATE_SOURCE = "counterfactual_knowledge_final_promotion_gate";
const PROVISIONAL_SCOPE = "platform_provisional_knowledge";
const MAX_KEYRING_KEYS = 16;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const KEY_HEX_RE = /^(?:[A-Fa-f0-9]{64}|[A-Fa-f0-9]{128})$/;
const MAC_HEX_RE = /^[A-Fa-f0-9]{64}$/;
const SHA256_HEX_RE = /^[A-Fa-f0-9]{64}$/;
const DOMAIN_SEPARATOR = "avantiqo-final-promotion-candidate-authenticity-v1";
const CLAIM_BINDING_DOMAIN_SEPARATOR = "avantiqo-final-promotion-claim-binding-v1";

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseKeyring({ requireActive = false, env = process.env } = {}) {
  const rawKeyring = text(env?.[KEYRING_JSON_ENV], 32000);
  const activeKeyId = text(env?.[ACTIVE_KEY_ID_ENV], 80);
  if (!rawKeyring) {
    return {
      valid: false,
      reason: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEYRING_REQUIRED",
      active_key_id: activeKeyId || null,
      key_count: 0,
      key_ids: [],
      keys: new Map(),
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(rawKeyring);
  } catch {
    return {
      valid: false,
      reason: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEYRING_JSON_INVALID",
      active_key_id: activeKeyId || null,
      key_count: 0,
      key_ids: [],
      keys: new Map(),
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      valid: false,
      reason: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEYRING_OBJECT_REQUIRED",
      active_key_id: activeKeyId || null,
      key_count: 0,
      key_ids: [],
      keys: new Map(),
    };
  }

  const entries = Object.entries(parsed);
  if (!entries.length || entries.length > MAX_KEYRING_KEYS) {
    return {
      valid: false,
      reason: entries.length
        ? "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEYRING_TOO_LARGE"
        : "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEYRING_EMPTY",
      active_key_id: activeKeyId || null,
      key_count: entries.length,
      key_ids: [],
      keys: new Map(),
    };
  }

  const keys = new Map();
  for (const [rawKeyId, rawSecretHex] of entries) {
    const keyId = text(rawKeyId, 80);
    const secretHex = text(rawSecretHex, 128).toLowerCase();
    if (!KEY_ID_RE.test(keyId)) {
      return {
        valid: false,
        reason: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEY_ID_INVALID",
        active_key_id: activeKeyId || null,
        key_count: entries.length,
        key_ids: [],
        keys: new Map(),
      };
    }
    if (!KEY_HEX_RE.test(secretHex)) {
      return {
        valid: false,
        reason: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEY_MUST_BE_256_OR_512_BIT_HEX",
        active_key_id: activeKeyId || null,
        key_count: entries.length,
        key_ids: [],
        keys: new Map(),
      };
    }
    keys.set(keyId, secretHex);
  }

  const keyIds = [...keys.keys()].sort();
  if (requireActive) {
    if (!KEY_ID_RE.test(activeKeyId)) {
      return {
        valid: false,
        reason: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ACTIVE_KEY_ID_REQUIRED",
        active_key_id: activeKeyId || null,
        key_count: keys.size,
        key_ids: keyIds,
        keys,
      };
    }
    if (!keys.has(activeKeyId)) {
      return {
        valid: false,
        reason: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ACTIVE_KEY_NOT_IN_KEYRING",
        active_key_id: activeKeyId,
        key_count: keys.size,
        key_ids: keyIds,
        keys,
      };
    }
  }

  return {
    valid: true,
    reason: null,
    active_key_id: activeKeyId || null,
    key_count: keys.size,
    key_ids: keyIds,
    keys,
  };
}

export function isAvantiqoFinalPromotionCandidate(row = {}) {
  return Boolean(
    text(row?.memory_scope, 180) === FINAL_CANDIDATE_SCOPE &&
    text(row?.source, 180) === FINAL_CANDIDATE_SOURCE &&
    text(row?.memory_key, 240).startsWith("knowledge-final-promotion:") &&
    row?.active === true
  );
}

function claimBindingPayload(provisional = {}) {
  const metadata = object(provisional?.metadata);
  return {
    organization_id: text(provisional?.organization_id, 160),
    memory_scope: text(provisional?.memory_scope, 180),
    memory_key: text(provisional?.memory_key, 240),
    subject: text(provisional?.subject, 1000),
    content: text(provisional?.content, 12000),
    active: provisional?.active === true,
    valid_until: provisional?.valid_until ?? null,
    hypothesis_fingerprint: text(metadata.hypothesis_fingerprint, 128),
    synthesis_fingerprint: text(metadata.synthesis_fingerprint, 128) || null,
    epistemic_state: text(metadata.epistemic_state, 120),
    status: text(metadata.status, 120),
    updated_at: provisional?.updated_at ?? null,
  };
}

export function createAvantiqoFinalPromotionCandidateClaimBinding(provisional = {}) {
  const payload = claimBindingPayload(provisional);
  if (
    payload.memory_scope !== PROVISIONAL_SCOPE ||
    !payload.organization_id ||
    !payload.memory_key ||
    !payload.content ||
    !payload.hypothesis_fingerprint ||
    payload.active !== true ||
    payload.status !== "PROVISIONAL_SHADOW_ONLY" ||
    payload.epistemic_state !== "PROVISIONAL_NOT_CANONICAL" ||
    !payload.updated_at
  ) {
    return {
      success: false,
      contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
      reason: "FINAL_PROMOTION_PROVISIONAL_CLAIM_NOT_BINDABLE",
      binding: null,
    };
  }
  const digest = createHash("sha256")
    .update(`${CLAIM_BINDING_DOMAIN_SEPARATOR}\u0000`, "utf8")
    .update(`${AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT}\u0000`, "utf8")
    .update(stableJson(payload), "utf8")
    .digest("hex");
  return {
    success: true,
    contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
    reason: null,
    binding: {
      provisional_claim_binding_contract:
        AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
      provisional_claim_memory_key: payload.memory_key,
      provisional_claim_hypothesis_fingerprint: payload.hypothesis_fingerprint,
      provisional_claim_updated_at: payload.updated_at,
      provisional_claim_digest: digest,
    },
  };
}

export function verifyAvantiqoFinalPromotionCandidateClaimBinding(
  candidate = {},
  provisional = {},
) {
  const candidateMetadata = object(candidate?.metadata);
  const current = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
  if (!current.success || !current.binding) return false;
  if (
    text(candidate?.organization_id, 160) !== text(provisional?.organization_id, 160) ||
    text(candidateMetadata.hypothesis_fingerprint, 128) !==
      text(current.binding.provisional_claim_hypothesis_fingerprint, 128) ||
    text(candidateMetadata.provisional_claim_binding_contract, 180) !==
      AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT ||
    text(candidateMetadata.provisional_claim_memory_key, 240) !==
      text(current.binding.provisional_claim_memory_key, 240) ||
    text(candidateMetadata.provisional_claim_updated_at, 120) !==
      text(current.binding.provisional_claim_updated_at, 120)
  ) {
    return false;
  }
  const supplied = text(candidateMetadata.provisional_claim_digest, 64).toLowerCase();
  const expected = text(current.binding.provisional_claim_digest, 64).toLowerCase();
  return SHA256_HEX_RE.test(supplied) && supplied === expected;
}

function authenticityPayload(row) {
  const metadata = { ...object(row?.metadata) };
  delete metadata.final_promotion_candidate_authenticity_mac;
  return {
    organization_id: text(row?.organization_id, 160),
    party_id: row?.party_id ?? null,
    entity_id: row?.entity_id ?? null,
    conversation_id: row?.conversation_id ?? null,
    source_turn_id: row?.source_turn_id ?? null,
    memory_scope: text(row?.memory_scope, 180),
    memory_key: text(row?.memory_key, 240),
    memory_type: text(row?.memory_type, 120),
    subject: text(row?.subject, 1000),
    content: text(row?.content, 12000),
    importance: Number(row?.importance),
    confidence: Number(row?.confidence),
    source: text(row?.source, 180),
    active: row?.active === true,
    valid_until: row?.valid_until ?? null,
    superseded_by: row?.superseded_by ?? null,
    superseded_at: row?.superseded_at ?? null,
    forgotten_at: row?.forgotten_at ?? null,
    metadata,
  };
}

function macWithSecretHex(row, secretHex) {
  const key = createSecretKey(Buffer.from(secretHex, "hex"));
  return createHmac("sha256", key)
    .update(`${DOMAIN_SEPARATOR}\u0000`, "utf8")
    .update(`${AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT}\u0000`, "utf8")
    .update(stableJson(authenticityPayload(row)), "utf8")
    .digest("hex");
}

function constantTimeMacEqual(left, right) {
  if (!MAC_HEX_RE.test(text(left, 64)) || !MAC_HEX_RE.test(text(right, 64))) {
    return false;
  }
  const leftBuffer = Buffer.from(text(left, 64), "hex");
  const rightBuffer = Buffer.from(text(right, 64), "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getAvantiqoFinalPromotionCandidateAuthenticityStatus({
  require_active = false,
} = {}) {
  const configuration = parseKeyring({ requireActive: require_active === true });
  return {
    success: true,
    contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
    algorithm: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ALGORITHM,
    available: configuration.valid,
    reason: configuration.reason,
    active_key_id: configuration.active_key_id,
    key_count: configuration.key_count,
    key_ids: configuration.key_ids,
    claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
    domain_separated_from_observation_authenticity: true,
    domain_separated_from_evidence_candidate_authenticity: true,
    domain_separated_from_mechanism_agenda_authenticity: true,
    server_only_keyring_required: true,
    client_exposure_allowed: false,
    database_stored_secret_allowed: false,
    key_rotation_supported: true,
  };
}

export function sealAvantiqoFinalPromotionCandidateAuthenticity(row) {
  const configuration = parseKeyring({ requireActive: true });
  if (!configuration.valid) {
    return {
      success: false,
      contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
      status: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_NOT_SEALED",
      reason: configuration.reason,
      row: null,
    };
  }
  if (!isAvantiqoFinalPromotionCandidate(row)) {
    return {
      success: false,
      contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
      status: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_NOT_SEALED",
      reason: "FINAL_PROMOTION_CANDIDATE_SHAPE_REQUIRED",
      row: null,
    };
  }

  const metadata = object(row?.metadata);
  if (
    text(metadata.provisional_claim_binding_contract, 180) !==
      AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT ||
    !text(metadata.provisional_claim_memory_key, 240) ||
    !text(metadata.provisional_claim_updated_at, 120) ||
    !SHA256_HEX_RE.test(text(metadata.provisional_claim_digest, 64))
  ) {
    return {
      success: false,
      contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
      status: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_NOT_SEALED",
      reason: "FINAL_PROMOTION_PROVISIONAL_CLAIM_BINDING_REQUIRED",
      row: null,
    };
  }

  const sealed = row;
  sealed.metadata = {
    ...metadata,
    final_promotion_candidate_authenticity_contract:
      AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
    final_promotion_candidate_authenticity_algorithm:
      AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ALGORITHM,
    final_promotion_candidate_authenticity_key_id: configuration.active_key_id,
    final_promotion_candidate_authenticity_domain_separated_from_observation: true,
    final_promotion_candidate_authenticity_domain_separated_from_evidence_candidate: true,
    final_promotion_candidate_authenticity_domain_separated_from_mechanism_agenda: true,
  };
  const secretHex = configuration.keys.get(configuration.active_key_id);
  sealed.metadata.final_promotion_candidate_authenticity_mac = macWithSecretHex(
    sealed,
    secretHex,
  );

  return {
    success: true,
    contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
    status: "FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_SEALED",
    key_id: configuration.active_key_id,
    row: sealed,
  };
}

export function createAvantiqoFinalPromotionCandidateAuthenticityVerifier() {
  const configuration = parseKeyring({ requireActive: false });
  return Object.freeze({
    available: configuration.valid,
    reason: configuration.reason,
    key_count: configuration.key_count,
    key_ids: configuration.key_ids,
    verify(row) {
      if (!configuration.valid || !isAvantiqoFinalPromotionCandidate(row)) return false;
      const metadata = object(row?.metadata);
      if (
        text(metadata.final_promotion_candidate_authenticity_contract, 180) !==
          AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT ||
        text(metadata.final_promotion_candidate_authenticity_algorithm, 40) !==
          AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ALGORITHM ||
        text(metadata.provisional_claim_binding_contract, 180) !==
          AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT
      ) {
        return false;
      }
      const keyId = text(metadata.final_promotion_candidate_authenticity_key_id, 80);
      const suppliedMac = text(
        metadata.final_promotion_candidate_authenticity_mac,
        64,
      ).toLowerCase();
      if (!KEY_ID_RE.test(keyId) || !MAC_HEX_RE.test(suppliedMac)) return false;
      const secretHex = configuration.keys.get(keyId);
      if (!secretHex) return false;
      return constantTimeMacEqual(suppliedMac, macWithSecretHex(row, secretHex));
    },
  });
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  algorithm: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_ALGORITHM,
  claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  isFinalPromotionCandidate: isAvantiqoFinalPromotionCandidate,
  createClaimBinding: createAvantiqoFinalPromotionCandidateClaimBinding,
  verifyClaimBinding: verifyAvantiqoFinalPromotionCandidateClaimBinding,
  getStatus: getAvantiqoFinalPromotionCandidateAuthenticityStatus,
  seal: sealAvantiqoFinalPromotionCandidateAuthenticity,
  createVerifier: createAvantiqoFinalPromotionCandidateAuthenticityVerifier,
});
