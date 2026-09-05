import { createHash } from "node:crypto";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,
  canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson,
  createAvantiqoFinalKnowledgeReleaseReceiptDraft as createBaseReceiptDraft,
  createAvantiqoFinalKnowledgeReleaseReceiptVerifier as createBaseReceiptVerifier,
  sealAvantiqoFinalKnowledgeReleaseReceipt as sealBaseReceipt,
  verifyAvantiqoFinalKnowledgeReleaseReceiptLineage as verifyBaseReceiptLineage,
} from "./AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js";

export {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,
};

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_V1";

const DOMAIN_SEPARATOR = "avantiqo-final-knowledge-release-receipt-atomic-binding-v1";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[a-f0-9]{64}$/i;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function createAvantiqoFinalKnowledgeReleaseBindingDigest(releaseRow = {}) {
  const metadata = object(releaseRow?.metadata);
  if (
    text(releaseRow?.organization_id, 160) === "" ||
    text(releaseRow?.memory_scope, 180) !== "platform_knowledge" ||
    text(releaseRow?.memory_type, 120) !== "fact" ||
    text(releaseRow?.source, 180) !== "avantiqo_explicit_final_knowledge_release" ||
    !text(releaseRow?.memory_key, 240) ||
    !HEX64_RE.test(text(metadata.release_id, 128)) ||
    !HEX64_RE.test(text(metadata.final_release_authorization_id, 128)) ||
    !HEX64_RE.test(text(metadata.final_promotion_candidate_authenticity_mac, 64)) ||
    !HEX64_RE.test(text(metadata.provisional_claim_digest, 64))
  ) {
    return { success: false, reason: "RELEASE_BINDING_DIGEST_INPUT_INVALID", digest: null };
  }

  const payload = {
    organization_id: text(releaseRow.organization_id, 160).toLowerCase(),
    memory_key: text(releaseRow.memory_key, 240),
    memory_type: text(releaseRow.memory_type, 120),
    subject: text(releaseRow.subject, 1000),
    content: text(releaseRow.content, 12000),
    importance: Number(releaseRow.importance),
    confidence: Number(releaseRow.confidence),
    source: text(releaseRow.source, 180),
    valid_until: releaseRow.valid_until ?? null,
    release_id: text(metadata.release_id, 128).toLowerCase(),
    hypothesis_fingerprint: text(metadata.hypothesis_fingerprint, 128).toLowerCase(),
    final_release_authorization_id: text(metadata.final_release_authorization_id, 128).toLowerCase(),
    final_promotion_candidate_authenticity_mac: text(
      metadata.final_promotion_candidate_authenticity_mac,
      64,
    ).toLowerCase(),
    provisional_claim_memory_key: text(metadata.provisional_claim_memory_key, 240),
    provisional_claim_digest: text(metadata.provisional_claim_digest, 64).toLowerCase(),
    evidence_graph_memory_key: text(metadata.evidence_graph_memory_key, 240) || null,
    reusable_platform_knowledge: metadata.reusable_platform_knowledge === true,
    knowledge_router_reuse_allowed: metadata.knowledge_router_reuse_allowed === true,
  };
  const digest = createHash("sha256")
    .update(`${DOMAIN_SEPARATOR}\u0000${canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson(payload)}`, "utf8")
    .digest("hex");
  return { success: true, reason: null, digest, payload };
}

export function createAvantiqoFinalKnowledgeReleaseReceiptDraft({
  organization_id,
  authorization,
  candidate,
  provisional,
  release_row,
  consumption_memory_key,
  consumption_row_id,
  release_row_id,
  receipt_row_id,
  transaction_id,
  committed_at,
} = {}) {
  const consumptionRowId = text(consumption_row_id, 80).toLowerCase();
  const releaseRowId = text(release_row_id, 80).toLowerCase();
  const receiptRowId = text(receipt_row_id, 80).toLowerCase();
  const transactionId = text(transaction_id, 80).toLowerCase();
  if (
    !UUID_RE.test(consumptionRowId) ||
    !UUID_RE.test(releaseRowId) ||
    !UUID_RE.test(receiptRowId) ||
    !UUID_RE.test(transactionId) ||
    text(release_row?.id, 80).toLowerCase() !== releaseRowId ||
    consumptionRowId === releaseRowId ||
    consumptionRowId === receiptRowId ||
    releaseRowId === receiptRowId
  ) {
    return { success: false, reason: "RELEASE_RECEIPT_EXACT_ROW_IDENTITIES_REQUIRED", row: null };
  }

  const binding = createAvantiqoFinalKnowledgeReleaseBindingDigest(release_row);
  if (!binding.success) return { success: false, reason: binding.reason, row: null };

  const base = createBaseReceiptDraft({
    organization_id,
    authorization,
    candidate,
    provisional,
    release_row,
    consumption_memory_key,
    transaction_id: transactionId,
    committed_at,
  });
  if (base.success !== true || !base.row) return base;

  return {
    ...base,
    row: {
      ...base.row,
      id: receiptRowId,
      metadata: {
        ...object(base.row.metadata),
        atomic_binding_contract:
          AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_CONTRACT,
        consumption_row_id: consumptionRowId,
        release_row_id: releaseRowId,
        receipt_row_id: receiptRowId,
        released_knowledge_binding_digest: binding.digest,
        exact_persisted_row_ids_bound: true,
      },
    },
  };
}

export function sealAvantiqoFinalKnowledgeReleaseReceipt(row, options = {}) {
  return sealBaseReceipt(row, options);
}

export function createAvantiqoFinalKnowledgeReleaseReceiptVerifier(options = {}) {
  const base = createBaseReceiptVerifier(options);
  return Object.freeze({
    available: base.available,
    reason: base.reason,
    key_ids: base.key_ids,
    verify(row) {
      const metadata = object(row?.metadata);
      return Boolean(
        base.verify(row) &&
        text(metadata.atomic_binding_contract, 180) ===
          AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_CONTRACT &&
        metadata.exact_persisted_row_ids_bound === true &&
        UUID_RE.test(text(metadata.consumption_row_id, 80)) &&
        UUID_RE.test(text(metadata.release_row_id, 80)) &&
        UUID_RE.test(text(metadata.receipt_row_id, 80)) &&
        text(metadata.receipt_row_id, 80).toLowerCase() === text(row?.id, 80).toLowerCase() &&
        HEX64_RE.test(text(metadata.released_knowledge_binding_digest, 64))
      );
    },
  });
}

export function verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(receipt, releaseRow) {
  const metadata = object(receipt?.metadata);
  const binding = createAvantiqoFinalKnowledgeReleaseBindingDigest(releaseRow);
  return Boolean(
    binding.success &&
    text(metadata.release_row_id, 80).toLowerCase() === text(releaseRow?.id, 80).toLowerCase() &&
    text(metadata.released_knowledge_binding_digest, 64).toLowerCase() ===
      text(binding.digest, 64).toLowerCase()
  );
}

export function verifyAvantiqoFinalKnowledgeReleaseReceiptLineage(
  receipt,
  { authorization, candidate, provisional, releaseRow } = {},
) {
  const metadata = object(receipt?.metadata);
  const authorizationMetadata = object(authorization?.metadata);
  return Boolean(
    verifyBaseReceiptLineage(receipt, { authorization, candidate, provisional, releaseRow }) &&
    verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(receipt, releaseRow) &&
    text(metadata.approver_role_at_issue, 40) === text(authorizationMetadata.approver_role_at_issue, 40) &&
    text(metadata.authority_function, 240) === text(authorizationMetadata.authority_function, 240)
  );
}

export default Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_ATOMIC_BINDING_CONTRACT,
  receipt_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
  receipt_scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,
  createBindingDigest: createAvantiqoFinalKnowledgeReleaseBindingDigest,
  createDraft: createAvantiqoFinalKnowledgeReleaseReceiptDraft,
  seal: sealAvantiqoFinalKnowledgeReleaseReceipt,
  createVerifier: createAvantiqoFinalKnowledgeReleaseReceiptVerifier,
  verifyBinding: verifyAvantiqoFinalKnowledgeReleaseReceiptBinding,
  verifyLineage: verifyAvantiqoFinalKnowledgeReleaseReceiptLineage,
});
