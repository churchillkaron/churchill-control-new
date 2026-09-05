import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateClaimBinding,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";
import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
} from "./AvantiqoReleasedKnowledgeAuthenticityRuntime.js";

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_V1";
export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ALGORITHM = "Ed25519";
export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CANONICALIZATION = "RFC8785-JCS";
export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE =
  "platform_learning_knowledge_release_receipts";

const SOURCE = "immutable_final_knowledge_release_receipt";
const ACTIVE_KEY_ID_ENV = "AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_ACTIVE_KEY_ID";
const PRIVATE_KEY_ENV = "AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_PRIVATE_KEY_PKCS8_B64";
const PUBLIC_KEYRING_ENV = "AVANTIQO_KNOWLEDGE_RELEASE_RECEIPT_PUBLIC_KEYRING_JSON";
const DOMAIN_SEPARATOR = "avantiqo-final-knowledge-release-receipt-v1";
const MAX_KEYS = 16;
const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const SIGNATURE_RE = /^[A-Za-z0-9_-]{80,100}$/;
const HEX64_RE = /^[a-f0-9]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hasOnlyUnicodeScalarValues(value) {
  const source = String(value);
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export function canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson(value) {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") {
    if (!hasOnlyUnicodeScalarValues(value)) {
      throw new Error("AVANTIQO_RELEASE_RECEIPT_JCS_INVALID_UNICODE");
    }
    return JSON.stringify(value);
  }
  if (type === "boolean") return value ? "true" : "false";
  if (type === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("AVANTIQO_RELEASE_RECEIPT_JCS_INVALID_NUMBER");
    }
    return JSON.stringify(value);
  }
  if (type !== "object") {
    throw new Error("AVANTIQO_RELEASE_RECEIPT_JCS_UNSUPPORTED_VALUE");
  }
  if (Array.isArray(value)) {
    const parts = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) throw new Error("AVANTIQO_RELEASE_RECEIPT_JCS_SPARSE_ARRAY_FORBIDDEN");
      parts.push(canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson(value[index]));
    }
    return `[${parts.join(",")}]`;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("AVANTIQO_RELEASE_RECEIPT_JCS_PLAIN_OBJECT_REQUIRED");
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (!hasOnlyUnicodeScalarValues(key)) throw new Error("AVANTIQO_RELEASE_RECEIPT_JCS_INVALID_KEY_UNICODE");
    if (value[key] === undefined) throw new Error("AVANTIQO_RELEASE_RECEIPT_JCS_UNDEFINED_FORBIDDEN");
  }
  keys.sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson(value[key])}`).join(",")}}`;
}

function publicKeyring(env = process.env) {
  const raw = text(env?.[PUBLIC_KEYRING_ENV], 64000);
  if (!raw) return { valid: false, reason: "RELEASE_RECEIPT_PUBLIC_KEYRING_REQUIRED", keys: new Map(), key_ids: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "RELEASE_RECEIPT_PUBLIC_KEYRING_JSON_INVALID", keys: new Map(), key_ids: [] };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { valid: false, reason: "RELEASE_RECEIPT_PUBLIC_KEYRING_OBJECT_REQUIRED", keys: new Map(), key_ids: [] };
  }
  const entries = Object.entries(parsed);
  if (!entries.length || entries.length > MAX_KEYS) {
    return {
      valid: false,
      reason: entries.length ? "RELEASE_RECEIPT_PUBLIC_KEYRING_TOO_LARGE" : "RELEASE_RECEIPT_PUBLIC_KEYRING_EMPTY",
      keys: new Map(),
      key_ids: [],
    };
  }
  const keys = new Map();
  try {
    for (const [rawId, rawKey] of entries) {
      const keyId = text(rawId, 80);
      if (!KEY_ID_RE.test(keyId)) throw new Error("KEY_ID");
      const key = createPublicKey({ key: Buffer.from(text(rawKey, 2000), "base64"), format: "der", type: "spki" });
      if (key.asymmetricKeyType !== "ed25519") throw new Error("KEY_TYPE");
      keys.set(keyId, key);
    }
  } catch {
    return { valid: false, reason: "RELEASE_RECEIPT_PUBLIC_KEY_INVALID", keys: new Map(), key_ids: [] };
  }
  return { valid: true, reason: null, keys, key_ids: [...keys.keys()].sort() };
}

function signingConfig(env = process.env) {
  const ring = publicKeyring(env);
  if (!ring.valid) return { ...ring, private_key: null, active_key_id: null };
  const activeKeyId = text(env?.[ACTIVE_KEY_ID_ENV], 80);
  if (!KEY_ID_RE.test(activeKeyId) || !ring.keys.has(activeKeyId)) {
    return { ...ring, valid: false, reason: "RELEASE_RECEIPT_ACTIVE_PUBLIC_KEY_REQUIRED", private_key: null, active_key_id: activeKeyId || null };
  }
  const rawPrivate = text(env?.[PRIVATE_KEY_ENV], 8000);
  if (!rawPrivate) {
    return { ...ring, valid: false, reason: "RELEASE_RECEIPT_PRIVATE_SIGNING_KEY_REQUIRED", private_key: null, active_key_id: activeKeyId };
  }
  try {
    const privateKey = createPrivateKey({ key: Buffer.from(rawPrivate, "base64"), format: "der", type: "pkcs8" });
    if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("KEY_TYPE");
    const derived = createPublicKey(privateKey).export({ format: "der", type: "spki" });
    const configured = ring.keys.get(activeKeyId).export({ format: "der", type: "spki" });
    if (!Buffer.from(derived).equals(Buffer.from(configured))) throw new Error("KEY_MISMATCH");
    return { ...ring, valid: true, reason: null, private_key: privateKey, active_key_id: activeKeyId };
  } catch {
    return { ...ring, valid: false, reason: "RELEASE_RECEIPT_PRIVATE_SIGNING_KEY_INVALID_OR_MISMATCHED", private_key: null, active_key_id: activeKeyId };
  }
}

export function createAvantiqoFinalKnowledgeReleaseReceiptIdentity({
  organization_id,
  authorization_id,
  release_id,
} = {}) {
  const organizationId = text(organization_id, 160).toLowerCase();
  const authorizationId = text(authorization_id, 128).toLowerCase();
  const releaseId = text(release_id, 128).toLowerCase();
  if (!UUID_RE.test(organizationId) || !HEX64_RE.test(authorizationId) || !HEX64_RE.test(releaseId)) {
    return { success: false, reason: "RELEASE_RECEIPT_IDENTITY_INPUTS_REQUIRED", receipt_id: null, memory_key: null };
  }
  const receiptId = createHash("sha256")
    .update(`${DOMAIN_SEPARATOR}\u0000identity\u0000${organizationId}\u0000${authorizationId}\u0000${releaseId}`, "utf8")
    .digest("hex");
  return {
    success: true,
    reason: null,
    receipt_id: receiptId,
    memory_key: `final-knowledge-release-receipt:${receiptId.slice(0, 40)}`,
  };
}

export function isAvantiqoFinalKnowledgeReleaseReceipt(row = {}) {
  const metadata = object(row?.metadata);
  return Boolean(
    text(row?.memory_scope, 180) === AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE &&
    text(row?.memory_type, 120) === "completed_step" &&
    text(row?.source, 180) === SOURCE &&
    text(row?.memory_key, 240).startsWith("final-knowledge-release-receipt:") &&
    text(metadata.contract, 180) === AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT
  );
}

function receiptPayload(row) {
  const metadata = { ...object(row?.metadata) };
  delete metadata.release_receipt_signature;
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
    `${DOMAIN_SEPARATOR}\u0000${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT}\u0000${canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson(receiptPayload(row))}`,
    "utf8",
  );
}

function authorizationSignatureHash(signature) {
  return createHash("sha256").update(text(signature, 240), "utf8").digest("hex");
}

function releaseOriginMac(releaseRow) {
  const metadata = object(releaseRow?.metadata);
  return text(
    metadata.released_knowledge_origin_authenticity_mac || metadata.released_knowledge_authenticity_mac,
    64,
  ).toLowerCase();
}

export function createAvantiqoFinalKnowledgeReleaseReceiptDraft({
  organization_id,
  authorization,
  candidate,
  provisional,
  release_row,
  consumption_memory_key,
  transaction_id,
  committed_at,
} = {}) {
  const organizationId = text(organization_id, 160).toLowerCase();
  const authorizationMetadata = object(authorization?.metadata);
  const candidateMetadata = object(candidate?.metadata);
  const provisionalMetadata = object(provisional?.metadata);
  const releaseMetadata = object(release_row?.metadata);
  const authorizationId = text(authorizationMetadata.authorization_id, 128).toLowerCase();
  const releaseId = text(releaseMetadata.release_id, 128).toLowerCase();
  const authorizationSignature = text(authorizationMetadata.release_authorization_signature, 240);
  const candidateMac = text(candidateMetadata.final_promotion_candidate_authenticity_mac, 64).toLowerCase();
  const claimDigest = text(candidateMetadata.provisional_claim_digest, 64).toLowerCase();
  const releaseMac = text(releaseMetadata.released_knowledge_authenticity_mac, 64).toLowerCase();
  const transactionId = text(transaction_id, 80).toLowerCase();
  const committedAt = text(committed_at, 120);
  const committedAtMs = Date.parse(committedAt);
  const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
  const identity = createAvantiqoFinalKnowledgeReleaseReceiptIdentity({
    organization_id: organizationId,
    authorization_id: authorizationId,
    release_id: releaseId,
  });

  if (
    !identity.success ||
    !UUID_RE.test(transactionId) ||
    !Number.isFinite(committedAtMs) ||
    text(authorization?.organization_id, 160).toLowerCase() !== organizationId ||
    text(candidate?.organization_id, 160).toLowerCase() !== organizationId ||
    text(provisional?.organization_id, 160).toLowerCase() !== organizationId ||
    text(release_row?.organization_id, 160).toLowerCase() !== organizationId ||
    text(authorizationMetadata.contract, 180) !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT ||
    authorizationMetadata.authority_verified !== true ||
    !SIGNATURE_RE.test(authorizationSignature) ||
    text(candidateMetadata.final_promotion_candidate_authenticity_contract, 180) !== AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT ||
    text(candidateMetadata.provisional_claim_binding_contract, 180) !== AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT ||
    !HEX64_RE.test(candidateMac) ||
    !HEX64_RE.test(claimDigest) ||
    !claimBinding.success ||
    text(claimBinding.binding?.provisional_claim_digest, 64).toLowerCase() !== claimDigest ||
    text(claimBinding.binding?.provisional_claim_memory_key, 240) !== text(provisional?.memory_key, 240) ||
    text(releaseMetadata.released_knowledge_authenticity_contract, 180) !== AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT ||
    !HEX64_RE.test(releaseMac) ||
    text(releaseMetadata.final_release_authorization_id, 128).toLowerCase() !== authorizationId ||
    text(releaseMetadata.provisional_claim_digest, 64).toLowerCase() !== claimDigest ||
    releaseMetadata.final_release_authorization_one_use_consumed !== true ||
    text(consumption_memory_key, 240) !== `final-knowledge-release-authorization-consumed:${authorizationId.slice(0, 40)}`
  ) {
    return { success: false, reason: "RELEASE_RECEIPT_EXACT_RELEASE_LINEAGE_REQUIRED", row: null };
  }

  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,
    memory_key: identity.memory_key,
    memory_type: "completed_step",
    subject: text(release_row?.subject, 1000),
    content: "Immutable cryptographic receipt for one explicitly authorized atomic final knowledge release.",
    importance: 1,
    confidence: 1,
    source: SOURCE,
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
      status: "COMMITTED",
      receipt_id: identity.receipt_id,
      receipt_immutable: true,
      receipt_append_only: true,
      receipt_deletion_preserves_fail_closed_reuse: true,
      transaction_id: transactionId,
      committed_at: new Date(committedAtMs).toISOString(),
      database_transaction_time_max_skew_seconds: 60,
      atomic_commit_contract: "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_V1",
      transaction_atomic: true,
      partial_release_state_allowed: false,
      authorization_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
      authorization_id: authorizationId,
      authorization_memory_key: text(authorization?.memory_key, 240),
      authorization_signature_contract: text(authorizationMetadata.release_authorization_signature_contract, 180),
      authorization_signature_algorithm: text(authorizationMetadata.release_authorization_signature_algorithm, 40),
      authorization_signature_key_id: text(authorizationMetadata.release_authorization_signature_key_id, 80),
      authorization_signature: authorizationSignature,
      authorization_signature_sha256: authorizationSignatureHash(authorizationSignature),
      authorization_consumption_memory_key: text(consumption_memory_key, 240),
      approver_id: text(authorizationMetadata.approver_id, 160),
      approver_staff_account_id: text(authorizationMetadata.approver_staff_account_id, 80) || null,
      approver_auth_user_id: text(authorizationMetadata.approver_auth_user_id, 80) || null,
      approver_role_at_issue: text(authorizationMetadata.approver_role_at_issue, 40) || null,
      authority_function: text(authorizationMetadata.authority_function, 240) || null,
      authority_verified: true,
      authority_verified_at: text(authorizationMetadata.authority_verified_at, 120) || null,
      candidate_id: text(candidate?.id, 80),
      candidate_memory_key: text(candidate?.memory_key, 240),
      candidate_authenticity_contract: AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
      candidate_authenticity_key_id: text(candidateMetadata.final_promotion_candidate_authenticity_key_id, 80) || null,
      candidate_authenticity_mac: candidateMac,
      hypothesis_fingerprint: text(candidateMetadata.hypothesis_fingerprint, 128).toLowerCase(),
      provisional_id: text(provisional?.id, 80),
      provisional_claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
      provisional_claim_memory_key: text(provisional?.memory_key, 240),
      provisional_claim_updated_at: text(provisional?.updated_at, 120),
      provisional_claim_digest: claimDigest,
      release_memory_key: text(release_row?.memory_key, 240),
      release_id: releaseId,
      released_knowledge_authenticity_contract: AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
      released_knowledge_authenticity_key_id: text(releaseMetadata.released_knowledge_authenticity_key_id, 80) || null,
      released_knowledge_authenticity_mac_at_release: releaseMac,
      one_use_authorization_consumed: true,
      replay_allowed: false,
      automatic_receipt_issuance_without_release_allowed: false,
      automatic_knowledge_release_allowed: false,
      receipt_mutation_allowed: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_effect: "FINAL_KNOWLEDGE_RELEASE_AUDIT_ONLY",
      canonicalization: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CANONICALIZATION,
    },
    updated_at: new Date(committedAtMs).toISOString(),
  };

  return { success: true, reason: null, row, receipt_id: identity.receipt_id, memory_key: identity.memory_key };
}

export function sealAvantiqoFinalKnowledgeReleaseReceipt(row, { env = process.env } = {}) {
  if (!isAvantiqoFinalKnowledgeReleaseReceipt(row)) {
    return { success: false, reason: "RELEASE_RECEIPT_ROW_SHAPE_REQUIRED", row: null };
  }
  const config = signingConfig(env);
  if (!config.valid || !config.private_key) return { success: false, reason: config.reason, row: null };
  const sealed = {
    ...row,
    metadata: {
      ...object(row.metadata),
      release_receipt_signature_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
      release_receipt_signature_algorithm: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ALGORITHM,
      release_receipt_signature_key_id: config.active_key_id,
      release_receipt_signature: null,
    },
  };
  sealed.metadata.release_receipt_signature = sign(null, signingBytes(sealed), config.private_key).toString("base64url");
  const publicKey = config.keys.get(config.active_key_id);
  if (!publicKey || !verify(null, signingBytes(sealed), publicKey, Buffer.from(sealed.metadata.release_receipt_signature, "base64url"))) {
    return { success: false, reason: "RELEASE_RECEIPT_SELF_VERIFICATION_FAILED", row: null };
  }
  return { success: true, reason: null, row: sealed, key_id: config.active_key_id };
}

export function createAvantiqoFinalKnowledgeReleaseReceiptVerifier({ env = process.env } = {}) {
  const ring = publicKeyring(env);
  return Object.freeze({
    available: ring.valid,
    reason: ring.reason,
    key_ids: ring.key_ids,
    verify(row) {
      if (!ring.valid || !isAvantiqoFinalKnowledgeReleaseReceipt(row)) return false;
      const metadata = object(row.metadata);
      if (
        text(metadata.status, 80) !== "COMMITTED" ||
        metadata.receipt_immutable !== true ||
        metadata.receipt_append_only !== true ||
        metadata.transaction_atomic !== true ||
        metadata.partial_release_state_allowed !== false ||
        metadata.one_use_authorization_consumed !== true ||
        metadata.replay_allowed !== false ||
        metadata.receipt_mutation_allowed !== false ||
        text(metadata.canonicalization, 80) !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CANONICALIZATION ||
        text(metadata.release_receipt_signature_contract, 180) !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT ||
        text(metadata.release_receipt_signature_algorithm, 40) !== AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ALGORITHM
      ) return false;
      const identity = createAvantiqoFinalKnowledgeReleaseReceiptIdentity({
        organization_id: row.organization_id,
        authorization_id: metadata.authorization_id,
        release_id: metadata.release_id,
      });
      if (!identity.success || identity.memory_key !== row.memory_key || identity.receipt_id !== metadata.receipt_id) return false;
      const keyId = text(metadata.release_receipt_signature_key_id, 80);
      const signature = text(metadata.release_receipt_signature, 120);
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

export function verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(receipt, releaseRow) {
  if (!isAvantiqoFinalKnowledgeReleaseReceipt(receipt)) return false;
  const receiptMetadata = object(receipt?.metadata);
  const releaseMetadata = object(releaseRow?.metadata);
  const identity = createAvantiqoFinalKnowledgeReleaseReceiptIdentity({
    organization_id: releaseRow?.organization_id,
    authorization_id: releaseMetadata.final_release_authorization_id,
    release_id: releaseMetadata.release_id,
  });
  const originMac = releaseOriginMac(releaseRow);
  return Boolean(
    identity.success &&
    text(receipt?.organization_id, 160) === text(releaseRow?.organization_id, 160) &&
    text(receipt?.memory_key, 240) === identity.memory_key &&
    text(receiptMetadata.receipt_id, 128) === identity.receipt_id &&
    text(receiptMetadata.authorization_id, 128).toLowerCase() === text(releaseMetadata.final_release_authorization_id, 128).toLowerCase() &&
    text(receiptMetadata.release_memory_key, 240) === text(releaseRow?.memory_key, 240) &&
    text(receiptMetadata.release_id, 128).toLowerCase() === text(releaseMetadata.release_id, 128).toLowerCase() &&
    HEX64_RE.test(originMac) &&
    text(receiptMetadata.released_knowledge_authenticity_mac_at_release, 64).toLowerCase() === originMac &&
    text(receiptMetadata.provisional_claim_digest, 64).toLowerCase() === text(releaseMetadata.provisional_claim_digest, 64).toLowerCase()
  );
}

export function verifyAvantiqoFinalKnowledgeReleaseReceiptLineage(
  receipt,
  { authorization, candidate, provisional, releaseRow } = {},
) {
  if (!verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(receipt, releaseRow)) return false;
  const metadata = object(receipt?.metadata);
  const authorizationMetadata = object(authorization?.metadata);
  const candidateMetadata = object(candidate?.metadata);
  const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);
  const signature = text(authorizationMetadata.release_authorization_signature, 240);
  return Boolean(
    claimBinding.success &&
    text(metadata.authorization_id, 128).toLowerCase() === text(authorizationMetadata.authorization_id, 128).toLowerCase() &&
    text(metadata.authorization_memory_key, 240) === text(authorization?.memory_key, 240) &&
    text(metadata.authorization_signature, 240) === signature &&
    text(metadata.authorization_signature_sha256, 64).toLowerCase() === authorizationSignatureHash(signature) &&
    text(metadata.approver_id, 160) === text(authorizationMetadata.approver_id, 160) &&
    text(metadata.approver_staff_account_id, 80) === text(authorizationMetadata.approver_staff_account_id, 80) &&
    text(metadata.approver_auth_user_id, 80) === text(authorizationMetadata.approver_auth_user_id, 80) &&
    metadata.authority_verified === true && authorizationMetadata.authority_verified === true &&
    text(metadata.candidate_id, 80) === text(candidate?.id, 80) &&
    text(metadata.candidate_memory_key, 240) === text(candidate?.memory_key, 240) &&
    text(metadata.candidate_authenticity_mac, 64).toLowerCase() === text(candidateMetadata.final_promotion_candidate_authenticity_mac, 64).toLowerCase() &&
    text(metadata.provisional_id, 80) === text(provisional?.id, 80) &&
    text(metadata.provisional_claim_memory_key, 240) === text(provisional?.memory_key, 240) &&
    text(metadata.provisional_claim_updated_at, 120) === text(provisional?.updated_at, 120) &&
    text(metadata.provisional_claim_digest, 64).toLowerCase() === text(claimBinding.binding?.provisional_claim_digest, 64).toLowerCase()
  );
}

export function getAvantiqoFinalKnowledgeReleaseReceiptStatus({ env = process.env } = {}) {
  const ring = publicKeyring(env);
  const signing = signingConfig(env);
  return {
    success: true,
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
    algorithm: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ALGORITHM,
    canonicalization: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CANONICALIZATION,
    verification_available: ring.valid,
    signing_available: signing.valid,
    verification_reason: ring.reason,
    signing_reason: signing.reason,
    key_ids: ring.key_ids,
    active_signing_key_id: signing.active_key_id || null,
    asymmetric_authority_separation: true,
    verifier_private_key_required: false,
    signer_private_key_required: true,
    immutable_receipt_required: true,
    database_secret_required: false,
    unsigned_compatibility_allowed: false,
  };
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
  algorithm: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ALGORITHM,
  canonicalization: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CANONICALIZATION,
  scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,
  canonicalize: canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson,
  createIdentity: createAvantiqoFinalKnowledgeReleaseReceiptIdentity,
  createDraft: createAvantiqoFinalKnowledgeReleaseReceiptDraft,
  seal: sealAvantiqoFinalKnowledgeReleaseReceipt,
  createVerifier: createAvantiqoFinalKnowledgeReleaseReceiptVerifier,
  verifyBinding: verifyAvantiqoFinalKnowledgeReleaseReceiptBinding,
  verifyLineage: verifyAvantiqoFinalKnowledgeReleaseReceiptLineage,
  getStatus: getAvantiqoFinalKnowledgeReleaseReceiptStatus,
});
