from pathlib import Path

path = Path("lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js")
source = path.read_text()


def replace_exact(old, new, count=1):
    global source
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f"expected {count} anchor(s), found {actual}: {old[:120]!r}")
    source = source.replace(old, new, count)


replace_exact(
    '} from "./AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js";\n',
    '} from "./AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js";\nimport {\n  createAvantiqoFinalKnowledgeReleaseReceiptIdentity,\n} from "./AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js";\nimport {\n  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,\n  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,\n  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n  verifyAvantiqoFinalKnowledgeReleaseReceiptBinding,\n} from "./AvantiqoFinalKnowledgeReleaseReceiptAtomicBindingRuntime.js";\n',
)

replace_exact(
    'async function loadFinalReleaseAuthorization(organizationId, authorizationMemoryKey) {\n',
    '''async function loadFinalReleaseReceiptForRelease(organizationId, releaseRow) {
  const releaseMetadata = object(releaseRow?.metadata);
  const identity = createAvantiqoFinalKnowledgeReleaseReceiptIdentity({
    organization_id: organizationId,
    authorization_id: releaseMetadata.final_release_authorization_id,
    release_id: releaseMetadata.release_id,
  });
  if (!identity.success) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_RELEASE_RECEIPT_IDENTITY_REQUIRED`);
  }
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE)
    .eq("memory_key", identity.memory_key)
    .maybeSingle();
  if (result.error) throw result.error;
  const receipt = result.data || null;
  const verifier = createAvantiqoFinalKnowledgeReleaseReceiptVerifier();
  if (
    !receipt?.id ||
    verifier.available !== true ||
    !verifier.verify(receipt) ||
    !verifyAvantiqoFinalKnowledgeReleaseReceiptBinding(receipt, releaseRow)
  ) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_IMMUTABLE_RELEASE_RECEIPT_REQUIRED`);
  }
  return receipt;
}

async function loadFinalReleaseAuthorization(organizationId, authorizationMemoryKey) {
''',
)

replace_exact(
    '''    if (!releasedKnowledgeVerifier.verify(state.existingRelease)) {
      throw new Error(
        `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXISTING_RELEASE_AUTHENTICITY_REQUIRED`,
      );
    }
    return {
''',
    '''    if (!releasedKnowledgeVerifier.verify(state.existingRelease)) {
      throw new Error(
        `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXISTING_RELEASE_AUTHENTICITY_REQUIRED`,
      );
    }
    const existingReceipt = await loadFinalReleaseReceiptForRelease(
      organizationId,
      state.existingRelease,
    );
    return {
''',
)

replace_exact(
    '''      released_knowledge_authenticity_verified: true,
      idempotent: true,
''',
    '''      released_knowledge_authenticity_verified: true,
      immutable_release_receipt_verified: true,
      release_receipt_memory_key: existingReceipt.memory_key,
      idempotent: true,
''',
)

replace_exact(
    '''  if (atomicCommit.receipt?.transaction_atomic !== true) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_ATOMIC_COMMIT_REQUIRED`);
  }

  await writeEvent(releaseEventRow({
''',
    '''  if (
    atomicCommit.receipt?.transaction_atomic !== true ||
    atomicCommit.receipt?.release_receipt_persisted !== true ||
    !atomicCommit.releaseReceipt?.id ||
    !atomicCommit.releaseRow?.id
  ) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_ATOMIC_COMMIT_REQUIRED`);
  }

  await writeEvent(releaseEventRow({
''',
)

replace_exact(
    '''    release_authorization_id: authorizationConsumption.authorization_id,
    release_authorization_consumed: true,
    source_count: support.source_count,
''',
    '''    release_authorization_id: authorizationConsumption.authorization_id,
    release_authorization_consumed: true,
    release_receipt_memory_key: atomicCommit.releaseReceipt.memory_key,
    immutable_release_receipt_persisted: true,
    source_count: support.source_count,
''',
)

replace_exact(
    '''      partial_release_state_allowed: false,
      released_knowledge_authenticity_contract:
''',
    '''      partial_release_state_allowed: false,
      immutable_release_receipt_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
      immutable_release_receipt_persisted_atomically: true,
      immutable_release_receipt_required_for_idempotent_reuse: true,
      released_knowledge_authenticity_contract:
''',
)

if "RELEASE_APPROVAL_ENV" in source:
    raise SystemExit("stale RELEASE_APPROVAL_ENV unexpectedly present")

path.write_text(source)
print("AVANTIQO_FINAL_RELEASE_IMMUTABLE_RECEIPT_REUSE_WIRED")
