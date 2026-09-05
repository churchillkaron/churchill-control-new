from pathlib import Path


def replace_exact(path, old, new, count=1):
    target = Path(path)
    source = target.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} anchor(s), found {actual}: {old[:140]!r}")
    target.write_text(source.replace(old, new, count))


# Run the prepared P3 patch after correcting its one bad declaration-count assertion.
base_path = Path("scripts/patch-final-knowledge-release-immutable-receipt.py")
base = base_path.read_text()
old_count = "    '  p_candidate_metadata jsonb,\\n  p_provisional_metadata jsonb,\\n  p_committed_at timestamptz\\n',\n    '  p_candidate_metadata jsonb,\\n  p_provisional_metadata jsonb,\\n  p_receipt_row jsonb,\\n  p_transaction_id uuid,\\n  p_committed_at timestamptz\\n',\n    count=3,\n)"
new_count = old_count.replace("count=3", "count=1")
if base.count(old_count) != 1:
    raise SystemExit("base immutable receipt patch declaration-count anchor drifted")
base = base.replace(old_count, new_count, 1)
exec(compile(base, str(base_path), "exec"), {"__name__": "__main__"})

# Receipt signatures must bind the persisted receipt row id itself.
path = "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js"
replace_exact(
    path,
    "  return {\n    organization_id: text(row?.organization_id, 160),\n",
    "  return {\n    id: row?.id ?? null,\n    organization_id: text(row?.organization_id, 160),\n",
)
replace_exact(
    path,
    "export function createAvantiqoFinalKnowledgeReleaseReceiptDraft({\n",
    '''export function createAvantiqoFinalKnowledgeReleaseBindingDigest(releaseRow = {}) {
  const metadata = object(releaseRow?.metadata);
  if (
    text(releaseRow?.memory_scope, 180) !== "platform_knowledge" ||
    text(releaseRow?.memory_type, 120) !== "fact" ||
    text(releaseRow?.source, 180) !== "avantiqo_explicit_final_knowledge_release" ||
    !text(releaseRow?.memory_key, 240) ||
    !text(metadata.release_id, 128) ||
    !text(metadata.final_release_authorization_id, 128) ||
    !HEX64_RE.test(text(metadata.final_promotion_candidate_authenticity_mac, 64)) ||
    !HEX64_RE.test(text(metadata.provisional_claim_digest, 64))
  ) {
    return { success: false, reason: "RELEASE_BINDING_DIGEST_INPUT_INVALID", digest: null };
  }
  const payload = {
    organization_id: text(releaseRow?.organization_id, 160).toLowerCase(),
    memory_key: text(releaseRow?.memory_key, 240),
    memory_type: text(releaseRow?.memory_type, 120),
    subject: text(releaseRow?.subject, 1000),
    content: text(releaseRow?.content, 12000),
    importance: Number(releaseRow?.importance),
    confidence: Number(releaseRow?.confidence),
    source: text(releaseRow?.source, 180),
    valid_until: releaseRow?.valid_until ?? null,
    release_id: text(metadata.release_id, 128).toLowerCase(),
    hypothesis_fingerprint: text(metadata.hypothesis_fingerprint, 128).toLowerCase(),
    final_release_authorization_id: text(metadata.final_release_authorization_id, 128).toLowerCase(),
    candidate_authenticity_mac: text(metadata.final_promotion_candidate_authenticity_mac, 64).toLowerCase(),
    provisional_claim_memory_key: text(metadata.provisional_claim_memory_key, 240),
    provisional_claim_digest: text(metadata.provisional_claim_digest, 64).toLowerCase(),
    evidence_graph_memory_key: text(metadata.evidence_graph_memory_key, 240) || null,
    reusable_platform_knowledge: metadata.reusable_platform_knowledge === true,
    knowledge_router_reuse_allowed: metadata.knowledge_router_reuse_allowed === true,
    final_release_receipt_contract: text(metadata.final_release_receipt_contract, 180) || null,
    final_release_receipt_memory_key: text(metadata.final_release_receipt_memory_key, 240) || null,
  };
  const digest = createHash("sha256")
    .update(`${DOMAIN_SEPARATOR}\\u0000release-binding\\u0000${canonicalizeAvantiqoFinalKnowledgeReleaseReceiptJson(payload)}`, "utf8")
    .digest("hex");
  return { success: true, reason: null, digest, payload };
}

export function createAvantiqoFinalKnowledgeReleaseReceiptDraft({
''',
)
replace_exact(
    path,
    "  consumption_memory_key,\n  transaction_id,\n  committed_at,\n",
    "  consumption_memory_key,\n  consumption_row_id,\n  release_row_id,\n  receipt_row_id,\n  transaction_id,\n  committed_at,\n",
)
replace_exact(
    path,
    "  const transactionId = text(transaction_id, 80).toLowerCase();\n  const committedAt = text(committed_at, 120);\n",
    "  const consumptionRowId = text(consumption_row_id, 80).toLowerCase();\n  const releaseRowId = text(release_row_id, 80).toLowerCase();\n  const receiptRowId = text(receipt_row_id, 80).toLowerCase();\n  const transactionId = text(transaction_id, 80).toLowerCase();\n  const committedAt = text(committed_at, 120);\n",
)
replace_exact(
    path,
    "  const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);\n  const identity = createAvantiqoFinalKnowledgeReleaseReceiptIdentity({\n",
    "  const claimBinding = createAvantiqoFinalPromotionCandidateClaimBinding(provisional);\n  const releaseBinding = createAvantiqoFinalKnowledgeReleaseBindingDigest(release_row);\n  const identity = createAvantiqoFinalKnowledgeReleaseReceiptIdentity({\n",
)
replace_exact(
    path,
    "    !identity.success ||\n    !UUID_RE.test(transactionId) ||\n",
    "    !identity.success ||\n    !UUID_RE.test(consumptionRowId) ||\n    !UUID_RE.test(releaseRowId) ||\n    !UUID_RE.test(receiptRowId) ||\n    !UUID_RE.test(transactionId) ||\n    text(release_row?.id, 80).toLowerCase() !== releaseRowId ||\n    !releaseBinding.success ||\n    text(releaseMetadata.final_release_binding_digest, 64).toLowerCase() !== text(releaseBinding.digest, 64).toLowerCase() ||\n",
)
replace_exact(
    path,
    "  const row = {\n    organization_id: organizationId,\n",
    "  const row = {\n    id: receiptRowId,\n    organization_id: organizationId,\n",
)
replace_exact(
    path,
    "      authorization_consumption_memory_key: text(consumption_memory_key, 240),\n",
    "      authorization_consumption_memory_key: text(consumption_memory_key, 240),\n      consumption_row_id: consumptionRowId,\n      release_row_id: releaseRowId,\n      receipt_row_id: receiptRowId,\n",
)
replace_exact(
    path,
    "      released_knowledge_authenticity_mac_at_release: releaseMac,\n",
    "      released_knowledge_authenticity_mac_at_release: releaseMac,\n      released_knowledge_binding_digest: releaseBinding.digest,\n",
)
old_binding = '''  const originMac = releaseOriginMac(releaseRow);
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
'''
new_binding = '''  const releaseBinding = createAvantiqoFinalKnowledgeReleaseBindingDigest(releaseRow);
  return Boolean(
    identity.success &&
    releaseBinding.success &&
    text(receipt?.organization_id, 160) === text(releaseRow?.organization_id, 160) &&
    text(receipt?.memory_key, 240) === identity.memory_key &&
    text(receiptMetadata.receipt_id, 128) === identity.receipt_id &&
    text(receiptMetadata.receipt_row_id, 80).toLowerCase() === text(receipt?.id, 80).toLowerCase() &&
    UUID_RE.test(text(receiptMetadata.consumption_row_id, 80)) &&
    text(receiptMetadata.release_row_id, 80).toLowerCase() === text(releaseRow?.id, 80).toLowerCase() &&
    text(receiptMetadata.authorization_id, 128).toLowerCase() === text(releaseMetadata.final_release_authorization_id, 128).toLowerCase() &&
    text(receiptMetadata.release_memory_key, 240) === text(releaseRow?.memory_key, 240) &&
    text(receiptMetadata.release_id, 128).toLowerCase() === text(releaseMetadata.release_id, 128).toLowerCase() &&
    text(receiptMetadata.released_knowledge_binding_digest, 64).toLowerCase() === text(releaseBinding.digest, 64).toLowerCase() &&
    text(releaseMetadata.final_release_binding_digest, 64).toLowerCase() === text(releaseBinding.digest, 64).toLowerCase() &&
    text(receiptMetadata.provisional_claim_digest, 64).toLowerCase() === text(releaseMetadata.provisional_claim_digest, 64).toLowerCase()
  );
'''
replace_exact(path, old_binding, new_binding)
replace_exact(
    path,
    "    text(metadata.approver_auth_user_id, 80) === text(authorizationMetadata.approver_auth_user_id, 80) &&\n    metadata.authority_verified === true",
    "    text(metadata.approver_auth_user_id, 80) === text(authorizationMetadata.approver_auth_user_id, 80) &&\n    text(metadata.approver_role_at_issue, 40) === text(authorizationMetadata.approver_role_at_issue, 40) &&\n    text(metadata.authority_function, 240) === text(authorizationMetadata.authority_function, 240) &&\n    metadata.authority_verified === true",
)

# Preassign every row UUID and bind those exact identities into the signed receipt before RPC entry.
path = "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js"
replace_exact(
    path,
    "  const transactionId = randomUUID();\n  const receiptDraft = createAvantiqoFinalKnowledgeReleaseReceiptDraft({\n",
    "  const consumptionRowId = randomUUID();\n  const releaseRowId = randomUUID();\n  const receiptRowId = randomUUID();\n  const transactionId = randomUUID();\n  commit.consumptionRow.id = consumptionRowId;\n  releaseRow.id = releaseRowId;\n  const receiptDraft = createAvantiqoFinalKnowledgeReleaseReceiptDraft({\n",
)
replace_exact(
    path,
    "    consumption_memory_key: commit.consumptionRow.memory_key,\n    transaction_id: transactionId,\n",
    "    consumption_memory_key: commit.consumptionRow.memory_key,\n    consumption_row_id: consumptionRowId,\n    release_row_id: releaseRowId,\n    receipt_row_id: receiptRowId,\n    transaction_id: transactionId,\n",
)
replace_exact(
    path,
    "    receipt.release_receipt_persisted !== true ||\n    text(receipt.transaction_id, 80) !== transactionId ||\n",
    "    receipt.release_receipt_persisted !== true ||\n    text(receipt.transaction_id, 80) !== transactionId ||\n    text(receipt.consumption_id, 80) !== consumptionRowId ||\n    text(receipt.release_id, 80) !== releaseRowId ||\n    text(receipt.release_receipt_id, 80) !== receiptRowId ||\n",
)

# Release runtime: stable release digest + exact cryptographic receipt verification on idempotent reuse.
path = "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js"
replace_exact(
    path,
    "  createAvantiqoFinalKnowledgeReleaseReceiptIdentity,\n  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n",
    "  createAvantiqoFinalKnowledgeReleaseBindingDigest,\n  createAvantiqoFinalKnowledgeReleaseReceiptIdentity,\n  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n  verifyAvantiqoFinalKnowledgeReleaseReceiptBinding,\n",
)
old_stable = '''  const stableBindingValid = Boolean(
    receipt?.id &&
    verifier.available === true &&
    verifier.verify(receipt) &&
    text(receiptMetadata.release_memory_key, 240) === text(releaseRow?.memory_key, 240) &&
    text(receiptMetadata.release_id, 128) === text(releaseMetadata.release_id, 128) &&
    text(receiptMetadata.authorization_id, 128) === text(releaseMetadata.final_release_authorization_id, 128) &&
    text(receiptMetadata.provisional_claim_digest, 64) === text(releaseMetadata.provisional_claim_digest, 64)
  );
'''
new_stable = '''  const stableBindingValid = Boolean(
    receipt?.id &&
    verifier.available === true &&
    verifier.verify(receipt) &&
    verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(receipt, releaseRow)
  );
'''
replace_exact(path, old_stable, new_stable)
replace_exact(
    path,
    "  };\n  const releasedKnowledgeSeal = sealAvantiqoReleasedKnowledgeAuthenticity(releaseDraft);\n",
    "  };\n  const releaseBinding = createAvantiqoFinalKnowledgeReleaseBindingDigest(releaseDraft);\n  if (!releaseBinding.success) {\n    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_RELEASE_BINDING_DIGEST_REQUIRED`);\n  }\n  releaseDraft.metadata.final_release_binding_digest = releaseBinding.digest;\n  const releasedKnowledgeSeal = sealAvantiqoReleasedKnowledgeAuthenticity(releaseDraft);\n",
)

# Retrieval must validate the signed immutable receipt against the current release row, not metadata alone.
path = "lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js"
replace_exact(
    path,
    "  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n",
    "  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n  verifyAvantiqoFinalKnowledgeReleaseReceiptBinding,\n",
)
old_retrieval_binding = '''    const receiptMetadata = object(receipt?.metadata);
    const verified = Boolean(
      receipt?.id &&
      text(receiptMetadata.release_memory_key, 240) === text(row.memory_key, 240) &&
      text(receiptMetadata.release_id, 128) === text(metadata.release_id, 128) &&
      text(receiptMetadata.authorization_id, 128) === text(metadata.final_release_authorization_id, 128) &&
      text(receiptMetadata.provisional_claim_digest, 64) === text(metadata.provisional_claim_digest, 64)
    );
'''
new_retrieval_binding = '''    const verified = Boolean(
      receipt?.id &&
      verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(receipt, row)
    );
'''
replace_exact(path, old_retrieval_binding, new_retrieval_binding)

# Pending migration: correct function arity, use caller-preassigned row UUIDs, and validate exact receipt identities.
path = "supabase/migrations/20260905065000_atomic_final_knowledge_release.sql"
old_sig = "  uuid, uuid, text, timestamptz, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, timestamptz\n)"
new_sig = "  uuid, uuid, text, timestamptz, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz\n)"
replace_exact(path, old_sig, new_sig, count=2)
replace_exact(
    path,
    "  v_receipt_metadata := coalesce(p_receipt_row->'metadata', '{}'::jsonb);\n  v_consumption_memory_key := coalesce(p_consumption_row->>'memory_key', '');\n",
    "  v_receipt_metadata := coalesce(p_receipt_row->'metadata', '{}'::jsonb);\n  v_consumption_id := nullif(p_consumption_row->>'id', '')::uuid;\n  v_release_id := nullif(p_release_row->>'id', '')::uuid;\n  v_receipt_id := nullif(p_receipt_row->>'id', '')::uuid;\n  if v_consumption_id is null or v_release_id is null or v_receipt_id is null then\n    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_PREASSIGNED_ROW_IDS_REQUIRED';\n  end if;\n  if v_consumption_id = v_release_id or v_consumption_id = v_receipt_id or v_release_id = v_receipt_id then\n    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_ROW_IDS_MUST_BE_DISTINCT';\n  end if;\n  v_consumption_memory_key := coalesce(p_consumption_row->>'memory_key', '');\n",
)
replace_exact(
    path,
    "     or coalesce(v_release_metadata->>'knowledge_router_reuse_allowed', 'false') <> 'true' then\n",
    "     or coalesce(v_release_metadata->>'knowledge_router_reuse_allowed', 'false') <> 'true'\n     or coalesce(v_release_metadata->>'final_release_binding_digest', '') = '' then\n",
)
replace_exact(
    path,
    "     or coalesce(v_receipt_metadata->>'authorization_consumption_memory_key', '') <> v_consumption_memory_key\n",
    "     or coalesce(v_receipt_metadata->>'authorization_consumption_memory_key', '') <> v_consumption_memory_key\n     or coalesce(v_receipt_metadata->>'consumption_row_id', '') <> v_consumption_id::text\n     or coalesce(v_receipt_metadata->>'release_row_id', '') <> v_release_id::text\n     or coalesce(v_receipt_metadata->>'receipt_row_id', '') <> v_receipt_id::text\n",
)
replace_exact(
    path,
    "     or coalesce(v_receipt_metadata->>'released_knowledge_authenticity_mac_at_release', '') <> coalesce(v_release_metadata->>'released_knowledge_authenticity_mac', '')\n",
    "     or coalesce(v_receipt_metadata->>'released_knowledge_authenticity_mac_at_release', '') <> coalesce(v_release_metadata->>'released_knowledge_authenticity_mac', '')\n     or coalesce(v_receipt_metadata->>'released_knowledge_binding_digest', '') <> coalesce(v_release_metadata->>'final_release_binding_digest', '')\n",
)
replace_exact(
    path,
    "  insert into public.intelligence_memories (\n    organization_id, party_id, entity_id, conversation_id, source_turn_id,\n",
    "  insert into public.intelligence_memories (\n    id, organization_id, party_id, entity_id, conversation_id, source_turn_id,\n",
    count=3,
)
replace_exact(
    path,
    "  ) values (\n    p_organization_id, nullif(p_consumption_row->>'party_id', '')::uuid,\n",
    "  ) values (\n    v_consumption_id, p_organization_id, nullif(p_consumption_row->>'party_id', '')::uuid,\n",
)
replace_exact(
    path,
    "  ) values (\n    p_organization_id, nullif(p_release_row->>'party_id', '')::uuid,\n",
    "  ) values (\n    v_release_id, p_organization_id, nullif(p_release_row->>'party_id', '')::uuid,\n",
)
replace_exact(
    path,
    "  ) values (\n    p_organization_id, nullif(p_receipt_row->>'party_id', '')::uuid,\n",
    "  ) values (\n    v_receipt_id, p_organization_id, nullif(p_receipt_row->>'party_id', '')::uuid,\n",
)

print("AVANTIQO_P3_IMMUTABLE_RELEASE_RECEIPT_HARDENED_PATCH_APPLIED")
