import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateClaimBinding,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_V1";
export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ALGORITHM = "Ed25519";
export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE =
  "platform_learning_knowledge_release_authorizations";
export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONSUMPTION_SCOPE =
  "platform_learning_knowledge_release_authorization_consumptions";

const SOURCE = "explicit_final_knowledge_release_authorization";
const ACTIVE_KEY_ID_ENV = "AVANTIQO_KNOWLEDGE_RELEASE_AUTH_ACTIVE_KEY_ID";
const PRIVATE_KEY_ENV = "AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PRIVATE_KEY_PKCS8_B64";
const PUBLIC_KEYRING_ENV = "AVANTIQO_KNOWLEDGE_RELEASE_AUTH_PUBLIC_KEYRING_JSON";
const DOMAIN_SEPARATOR = "avantiqo-final-knowledge-release-authorization-v1";
const MAX_KEYS = 16;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 60;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SIGNATURE_RE = /^[A-Za-z0-9_-]{80,100}$/;
const HEX64_RE = /^[a-f0-9]{64}$/i;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function boundedMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(MIN_TTL_MINUTES, Math.min(MAX_TTL_MINUTES, Math.floor(parsed)));
}

function publicKeyring(env = process.env) {
  const raw = text(env?.[PUBLIC_KEYRING_ENV], 64000);
  if (!raw) return { valid: false, reason: "RELEASE_AUTH_PUBLIC_KEYRING_REQUIRED", keys: new Map(), key_ids: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "RELEASE_AUTH_PUBLIC_KEYRING_JSON_INVALID", keys: new Map(), key_ids: [] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, reason: "RELEASE_AUTH_PUBLIC_KEYRING_OBJECT_REQUIRED", keys: new Map(), key_ids: [] };
  }
  const entries = Object.entries(parsed);
  if (!entries.length || entries.length > MAX_KEYS) {
    return { valid: false, reason: entries.length ? "RELEASE_AUTH_PUBLIC_KEYRING_TOO_LARGE" : "RELEASE_AUTH_PUBLIC_KEYRING_EMPTY", keys: new Map(), key_ids: [] };
  }
  const keys = new Map();
  try {
    for (const [rawId, rawKey] of entries) {
      const keyId = text(rawId, 80);
      if (!KEY_ID_RE.test(keyId)) throw new Error("KEY_ID");
      const der = Buffer.from(text(rawKey, 2000), "base64");
      const key = createPublicKey({ key: der, format: "der", type: "spki" });
      if (key.asymmetricKeyType !== "ed25519") throw new Error("KEY_TYPE");
      keys.set(keyId, key);
    }
  } catch {
    return { valid: false, reason: "RELEASE_AUTH_PUBLIC_KEY_INVALID", keys: new Map(), key_ids: [] };
  }
  return { valid: true, reason: null, keys, key_ids: [...keys.keys()].sort() };
}

function signingConfig(env = process.env) {
  const ring = publicKeyring(env);
  if (!ring.valid) return { ...ring, private_key: null, active_key_id: null };
  const activeKeyId = text(env?.[ACTIVE_KEY_ID_ENV], 80);
  if (!KEY_ID_RE.test(activeKeyId) || !ring.keys.has(activeKeyId)) {
    return { ...ring, valid: false, reason: "RELEASE_AUTH_ACTIVE_PUBLIC_KEY_REQUIRED", private_key: null, active_key_id: activeKeyId || null };
  }
  const rawPrivate = text(env?.[PRIVATE_KEY_ENV], 8000);
  if (!rawPrivate) {
    return { ...ring, valid: false, reason: "RELEASE_AUTH_PRIVATE_SIGNING_KEY_REQUIRED", private_key: null, active_key_id: activeKeyId };
  }
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(rawPrivate, "base64"), format: "der", type: "pkcs8" });
    if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("KEY_TYPE");
    const derived = createPublicKey(privateKey).export({ format: "der", type: "spki" });
    const configured = ring.keys.get(activeKeyId).export({ format: "der", type: "spki" });
    if (!Buffer.from(derived).equals(Buffer.from(configured))) throw new Error("KEY_MISMATCH");
    return { ...ring, valid: true, reason: null, private_key: privateKey, active_key_id: activeKeyId };
  } catch {
    return { ...ring, valid: false, reason: "RELEASE_AUTH_PRIVATE_SIGNING_KEY_INVALID_OR_MISMATCHED", private_key: null, active_key_id: activeKeyId };
  }
}

export function isAvantiqoFinalKnowledgeReleaseAuthorization(row = {}) {
  return Boolean(
    text(row?.memory_scope, 180) === AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE &&
    text(row?.source, 180) === SOURCE &&
    text(row?.memory_key, 240).startsWith("final-knowledge-release-authorization:")
  );
}

function payload(row) {
  const metadata = { ...object(row?.metadata) };
  delete metadata.release_authorization_signature;
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
    updated_at: row?.updated_at ?? null,
  };
}

function signingBytes(row) {
  return Buffer.from(
    `${DOMAIN_SEPARATOR}\u0000${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT}\u0000${stableJson(payload(row))}`,
    "utf8",
  );
}

export function createAvantiqoFinalKnowledgeReleaseAuthorizationDraft({
  organization_id,
  candidate,
  provisional,
  approver_id,
  approval_reason,
  expires_in_minutes = 30,
  now = new Date(),
  nonce = randomUUID(),
} = {}) {
  const organizationId = text(organization_id, 160);
  const approverId = text(approver_id, 160);
  const approvalReason = text(approval_reason, 800);
  const candidateMetadata = object(candidate?.metadata);
  const provisionalMetadata = object(provisional?.metadata);
  const hypothesisFingerprint = text(candidateMetadata.hypothesis_fingerprint, 128).toLowerCase();
  const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
  const candidateMac = text(candidateMetadata.final_promotion_candidate_authenticity_mac, 64).toLowerCase();
  if (
    !organizationId || !approverId || approvalReason.length < 5 ||
    text(candidate?.organization_id, 160) !== organizationId ||
    text(provisional?.organization_id, 160) !== organizationId ||
    !HEX64_RE.test(hypothesisFingerprint) || !HEX64_RE.test(candidateMac) ||
    text(candidateMetadata.final_promotion_candidate_authenticity_contract, 180) !== AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT ||
    !claimBinding.success || !claimBinding.binding ||
    text(provisionalMetadata.hypothesis_fingerprint, 128).toLowerCase() !== hypothesisFingerprint ||
    text(candidateMetadata.provisional_claim_binding_contract, 180) !== AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT ||
    text(candidateMetadata.provisional_claim_digest, 64).toLowerCase() !== text(claimBinding.binding.provisional_claim_digest, 64).toLowerCase()
  ) {
    return { success: false, reason: "RELEASE_AUTH_EXACT_CANDIDATE_AND_CLAIM_REQUIRED", row: null };
  }
  const issuedAt = new Date(now);
  if (!Number.isFinite(issuedAt.getTime())) return { success: false, reason: "RELEASE_AUTH_ISSUED_AT_INVALID", row: null };
  const ttlMinutes = boundedMinutes(expires_in_minutes);
  const expiresAt = new Date(issuedAt.getTime() + ttlMinutes * 60_000);
  const cleanNonce = text(nonce, 160);
  if (cleanNonce.length < 16) return { success: false, reason: "RELEASE_AUTH_NONCE_REQUIRED", row: null };
  const authorizationId = createHash("sha256")
    .update(`${DOMAIN_SEPARATOR}\u0000${organizationId}\u0000${hypothesisFingerprint}\u0000${candidateMac}\u0000${claimBinding.binding.provisional_claim_digest}\u0000${cleanNonce}`)
    .digest("hex");
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE,
    memory_key: `final-knowledge-release-authorization:${authorizationId.slice(0, 40)}`,
    memory_type: "approval",
    subject: `knowledge-release:${hypothesisFingerprint.slice(0, 32)}`,
    content: `Explicit final knowledge release authorization by ${approverId}.`,
    importance: 1,
    confidence: 1,
    source: SOURCE,
    active: true,
    valid_until: expiresAt.toISOString(),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
      status: "READY",
      authorization_id: authorizationId,
      authorization_scope: "FINAL_KNOWLEDGE_RELEASE_ONLY",
      approver_id: approverId,
      approver_type: "HUMAN_OPERATOR",
      approval_reason: approvalReason,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      nonce: cleanNonce,
      hypothesis_fingerprint: hypothesisFingerprint,
      candidate_memory_key: text(candidate?.memory_key, 240),
      candidate_authenticity_contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
      candidate_authenticity_key_id: text(candidateMetadata.final_promotion_candidate_authenticity_key_id, 80),
      candidate_authenticity_mac: candidateMac,
      provisional_claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
      provisional_claim_memory_key: claimBinding.binding.provisional_claim_memory_key,
      provisional_claim_updated_at: claimBinding.binding.provisional_claim_updated_at,
      provisional_claim_digest: claimBinding.binding.provisional_claim_digest,
      evaluation_fingerprint: text(candidateMetadata.evaluation_fingerprint, 128) || null,
      one_use_required: true,
      replay_detection_required: true,
      server_side_enforcement_required: true,
      automatic_issuance_allowed: false,
      automatic_release_allowed: false,
      unsigned_compatibility_allowed: false,
      authorization_effect: "FINAL_KNOWLEDGE_RELEASE_ONLY",
    },
    updated_at: issuedAt.toISOString(),
  };
  return { success: true, reason: null, row, ttl_minutes: ttlMinutes };
}

export function sealAvantiqoFinalKnowledgeReleaseAuthorization(row, { env = process.env } = {}) {
  if (!isAvantiqoFinalKnowledgeReleaseAuthorization(row)) {
    return { success: false, reason: "RELEASE_AUTH_ROW_SHAPE_REQUIRED", row: null };
  }
  const config = signingConfig(env);
  if (!config.valid || !config.private_key) return { success: false, reason: config.reason, row: null };
  const sealed = {
    ...row,
    metadata: {
      ...object(row.metadata),
      release_authorization_signature_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
      release_authorization_signature_algorithm: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ALGORITHM,
      release_authorization_signature_key_id: config.active_key_id,
      release_authorization_signature: null,
    },
  };
  sealed.metadata.release_authorization_signature = sign(null, signingBytes(sealed), config.private_key).toString("base64url");
  if (!config.keys.get(config.active_key_id) || !verify(null, signingBytes(sealed), config.keys.get(config.active_key_id), Buffer.from(sealed.metadata.release_authorization_signature, "base64url"))) {
    return { success: false, reason: "RELEASE_AUTH_SELF_VERIFICATION_FAILED", row: null };
  }
  return { success: true, reason: null, row: sealed, key_id: config.active_key_id };
}

export function createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier({ env = process.env, now = () => Date.now() } = {}) {
  const ring = publicKeyring(env);
  return Object.freeze({
    available: ring.valid,
    reason: ring.reason,
    key_ids: ring.key_ids,
    verify(row, { require_ready = true, require_unexpired = true } = {}) {
      if (!ring.valid || !isAvantiqoFinalKnowledgeReleaseAuthorization(row)) return false;
      const metadata = object(row.metadata);
      if (
        text(metadata.contract, 180) !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT ||
        text(metadata.release_authorization_signature_contract, 180) !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT ||
        text(metadata.release_authorization_signature_algorithm, 40) !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ALGORITHM ||
        metadata.one_use_required !== true || metadata.replay_detection_required !== true ||
        metadata.automatic_issuance_allowed !== false || metadata.automatic_release_allowed !== false ||
        metadata.unsigned_compatibility_allowed !== false
      ) return false;
      if (require_ready && (row.active !== true || text(metadata.status, 80) !== "READY")) return false;
      const expiresAt = Date.parse(text(metadata.expires_at, 120));
      if (!Number.isFinite(expiresAt) || text(row.valid_until, 120) !== text(metadata.expires_at, 120)) return false;
      if (require_unexpired && expiresAt <= Number(now())) return false;
      const keyId = text(metadata.release_authorization_signature_key_id, 80);
      const signature = text(metadata.release_authorization_signature, 120);
      const key = ring.keys.get(keyId);
      if (!key || !SIGNATURE_RE.test(signature)) return false;
      try {
        return verify(null, signingBytes(row), key, Buffer.from(signature, "base64url"));
      } catch {
        return false;
      }
    },
  });
}

export function verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding(authorization, candidate, provisional) {
  const metadata = object(authorization?.metadata);
  const candidateMetadata = object(candidate?.metadata);
  const currentBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
  if (!currentBinding.success || !currentBinding.binding) return false;
  return Boolean(
    text(authorization?.organization_id, 160) === text(candidate?.organization_id, 160) &&
    text(candidate?.organization_id, 160) === text(provisional?.organization_id, 160) &&
    text(metadata.hypothesis_fingerprint, 128).toLowerCase() === text(candidateMetadata.hypothesis_fingerprint, 128).toLowerCase() &&
    text(metadata.candidate_memory_key, 240) === text(candidate?.memory_key, 240) &&
    text(metadata.candidate_authenticity_mac, 64).toLowerCase() === text(candidateMetadata.final_promotion_candidate_authenticity_mac, 64).toLowerCase() &&
    text(metadata.provisional_claim_memory_key, 240) === text(currentBinding.binding.provisional_claim_memory_key, 240) &&
    text(metadata.provisional_claim_updated_at, 120) === text(currentBinding.binding.provisional_claim_updated_at, 120) &&
    text(metadata.provisional_claim_digest, 64).toLowerCase() === text(currentBinding.binding.provisional_claim_digest, 64).toLowerCase()
  );
}

export function getAvantiqoFinalKnowledgeReleaseAuthorizationStatus({ env = process.env } = {}) {
  const ring = publicKeyring(env);
  const signing = signingConfig(env);
  return {
    success: true,
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
    algorithm: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ALGORITHM,
    verification_available: ring.valid,
    signing_available: signing.valid,
    verification_reason: ring.reason,
    signing_reason: signing.reason,
    key_ids: ring.key_ids,
    active_signing_key_id: signing.active_key_id || null,
    asymmetric_authority_separation: true,
    verifier_private_key_required: false,
    signer_private_key_required: true,
    one_use_required: true,
    max_ttl_minutes: MAX_TTL_MINUTES,
    unsigned_compatibility_allowed: false,
  };
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
  algorithm: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_ALGORITHM,
  scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE,
  consumption_scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONSUMPTION_SCOPE,
  createDraft: createAvantiqoFinalKnowledgeReleaseAuthorizationDraft,
  seal: sealAvantiqoFinalKnowledgeReleaseAuthorization,
  createVerifier: createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier,
  verifyBinding: verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding,
  getStatus: getAvantiqoFinalKnowledgeReleaseAuthorizationStatus,
});
