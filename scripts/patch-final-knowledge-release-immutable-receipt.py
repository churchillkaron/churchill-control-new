from pathlib import Path


def replace_exact(path, old, new, count=1):
    target = Path(path)
    source = target.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} anchor(s), found {actual}: {old[:120]!r}")
    target.write_text(source.replace(old, new, count))


# Atomic runtime: prepare, sign and verify an immutable release receipt before entering Postgres.
path = "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js"
replace_exact(
    path,
    'import { supabaseAdmin } from "@/lib/shared/supabase/admin";\n',
    'import { randomUUID } from "node:crypto";\nimport { supabaseAdmin } from "@/lib/shared/supabase/admin";\n',
)
replace_exact(
    path,
    '} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";\n',
    '} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";\nimport {\n  createAvantiqoFinalKnowledgeReleaseReceiptDraft,\n  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n  sealAvantiqoFinalKnowledgeReleaseReceipt,\n  verifyAvantiqoFinalKnowledgeReleaseReceiptLineage,\n} from "./AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js";\n',
)
replace_exact(
    path,
    '  const result = await supabaseAdmin.rpc("avantiqo_commit_final_knowledge_release", {\n',
    '''  const transactionId = randomUUID();
  const receiptDraft = createAvantiqoFinalKnowledgeReleaseReceiptDraft({
    organization_id: organizationId,
    authorization,
    candidate,
    provisional,
    release_row: releaseRow,
    consumption_memory_key: commit.consumptionRow.memory_key,
    transaction_id: transactionId,
    committed_at: nowIso,
  });
  if (receiptDraft.success !== true || !receiptDraft.row) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT}_${text(receiptDraft.reason, 180) || "RELEASE_RECEIPT_DRAFT_FAILED"}`);
  }
  const receiptSeal = sealAvantiqoFinalKnowledgeReleaseReceipt(receiptDraft.row);
  if (receiptSeal.success !== true || !receiptSeal.row) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT}_${text(receiptSeal.reason, 180) || "RELEASE_RECEIPT_SIGNING_FAILED"}`);
  }
  const receiptVerifier = createAvantiqoFinalKnowledgeReleaseReceiptVerifier();
  if (
    receiptVerifier.available !== true ||
    !receiptVerifier.verify(receiptSeal.row) ||
    !verifyAvantiqoFinalKnowledgeReleaseReceiptLineage(receiptSeal.row, {
      authorization,
      candidate,
      provisional,
      releaseRow,
    })
  ) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT}_RELEASE_RECEIPT_SELF_VERIFICATION_REQUIRED`);
  }

  const result = await supabaseAdmin.rpc("avantiqo_commit_final_knowledge_release", {
''',
)
replace_exact(
    path,
    '    p_provisional_metadata: commit.provisionalMetadata,\n    p_committed_at: nowIso,\n',
    '    p_provisional_metadata: commit.provisionalMetadata,\n    p_receipt_row: receiptSeal.row,\n    p_transaction_id: transactionId,\n    p_committed_at: nowIso,\n',
)
replace_exact(
    path,
    '    receipt.provisional_superseded !== true ||\n    text(receipt.release_memory_key, 240) !== text(releaseRow.memory_key, 240)\n',
    '    receipt.provisional_superseded !== true ||\n    receipt.release_receipt_persisted !== true ||\n    text(receipt.transaction_id, 80) !== transactionId ||\n    text(receipt.release_receipt_memory_key, 240) !== text(receiptSeal.row.memory_key, 240) ||\n    text(receipt.release_memory_key, 240) !== text(releaseRow.memory_key, 240)\n',
)
replace_exact(
    path,
    '  return { ...commit, receipt };\n',
    '  return { ...commit, receipt, releaseReceipt: receiptSeal.row };\n',
)

# Release runtime: bind expected receipt identity into the released row, require it on idempotent reuse,
# and surface immutable receipt evidence in the final result.
path = "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js"
replace_exact(
    path,
    '} from "./AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js";\n',
    '} from "./AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js";\nimport {\n  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,\n  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,\n  createAvantiqoFinalKnowledgeReleaseReceiptIdentity,\n  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n} from "./AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js";\n',
)
replace_exact(
    path,
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
  const receiptMetadata = object(receipt?.metadata);
  const verifier = createAvantiqoFinalKnowledgeReleaseReceiptVerifier();
  const stableBindingValid = Boolean(
    receipt?.id &&
    verifier.available === true &&
    verifier.verify(receipt) &&
    text(receiptMetadata.release_memory_key, 240) === text(releaseRow?.memory_key, 240) &&
    text(receiptMetadata.release_id, 128) === text(releaseMetadata.release_id, 128) &&
    text(receiptMetadata.authorization_id, 128) === text(releaseMetadata.final_release_authorization_id, 128) &&
    text(receiptMetadata.provisional_claim_digest, 64) === text(releaseMetadata.provisional_claim_digest, 64)
  );
  if (!stableBindingValid) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_IMMUTABLE_RELEASE_RECEIPT_REQUIRED`);
  }
  return receipt;
}

async function loadFinalReleaseAuthorization(organizationId, authorizationMemoryKey) {
''',
)
replace_exact(
    path,
    '    if (!releasedKnowledgeVerifier.verify(state.existingRelease)) {\n      throw new Error(\n        `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXISTING_RELEASE_AUTHENTICITY_REQUIRED`,\n      );\n    }\n    return {\n',
    '    if (!releasedKnowledgeVerifier.verify(state.existingRelease)) {\n      throw new Error(\n        `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXISTING_RELEASE_AUTHENTICITY_REQUIRED`,\n      );\n    }\n    const existingReceipt = await loadFinalReleaseReceiptForRelease(organizationId, state.existingRelease);\n    return {\n',
)
replace_exact(
    path,
    '      released_knowledge_authenticity_verified: true,\n      idempotent: true,\n',
    '      released_knowledge_authenticity_verified: true,\n      immutable_release_receipt_verified: true,\n      release_receipt_memory_key: existingReceipt.memory_key,\n      idempotent: true,\n',
)
replace_exact(
    path,
    '  const releasedKnowledgeSeal = sealAvantiqoReleasedKnowledgeAuthenticity(releaseDraft);\n',
    '''  const receiptIdentity = createAvantiqoFinalKnowledgeReleaseReceiptIdentity({
    organization_id: organizationId,
    authorization_id: authorizationId,
    release_id: releaseDraft.metadata?.release_id,
  });
  if (!receiptIdentity.success) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_RELEASE_RECEIPT_IDENTITY_REQUIRED`);
  }
  releaseDraft.metadata = {
    ...object(releaseDraft.metadata),
    final_release_receipt_required: true,
    final_release_receipt_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,
    final_release_receipt_memory_key: receiptIdentity.memory_key,
    final_release_receipt_immutable: true,
    final_release_receipt_required_for_reuse: true,
  };
  const releasedKnowledgeSeal = sealAvantiqoReleasedKnowledgeAuthenticity(releaseDraft);
''',
)
replace_exact(
    path,
    '    release_authorization_consumed: true,\n    source_count: support.source_count,\n',
    '    release_authorization_consumed: true,\n    release_receipt_memory_key: atomicCommit.releaseReceipt?.memory_key || null,\n    immutable_release_receipt_persisted: atomicCommit.receipt?.release_receipt_persisted === true,\n    source_count: support.source_count,\n',
)
replace_exact(
    path,
    '      partial_release_state_allowed: false,\n      released_knowledge_authenticity_contract:\n',
    '      partial_release_state_allowed: false,\n      immutable_release_receipt_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,\n      immutable_release_receipt_persisted_atomically: true,\n      immutable_release_receipt_required_for_reuse: true,\n      released_knowledge_authenticity_contract:\n',
)

# Retrieval: signed receipt is mandatory for learned-knowledge reuse. Receipt proof is evaluated
# dynamically so lifecycle HMAC resealing does not invalidate the immutable historical attestation.
path = "lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js"
replace_exact(
    path,
    '} from "@/lib/intelligence/runtime/AvantiqoReleasedKnowledgeAuthenticityRuntime";\n',
    '} from "@/lib/intelligence/runtime/AvantiqoReleasedKnowledgeAuthenticityRuntime";\nimport {\n  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT,\n  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE,\n  createAvantiqoFinalKnowledgeReleaseReceiptVerifier,\n} from "@/lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime";\n',
)
replace_exact(
    path,
    '    if (metadata.explicit_final_release_approved !== true) {\n',
    '''    if (metadata.final_release_receipt_required !== true) {
      blockers.push("IMMUTABLE_FINAL_RELEASE_RECEIPT_REQUIRED_FLAG_MISSING");
    }
    if (
      text(metadata.final_release_receipt_contract, 180) !==
        AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_CONTRACT
    ) {
      blockers.push("IMMUTABLE_FINAL_RELEASE_RECEIPT_CONTRACT_REQUIRED");
    }
    if (row?._immutable_release_receipt_verified !== true) {
      blockers.push("IMMUTABLE_FINAL_RELEASE_RECEIPT_VERIFICATION_REQUIRED");
    }
    if (metadata.explicit_final_release_approved !== true) {
''',
)
replace_exact(
    path,
    '      released_knowledge_authenticity_required: true,\n      database_only_released_claim_mutation_rejected: true,\n',
    '      released_knowledge_authenticity_required: true,\n      immutable_final_release_receipt_required: true,\n      receipt_deletion_or_tamper_blocks_reuse: true,\n      database_only_released_claim_mutation_rejected: true,\n',
)
replace_exact(
    path,
    '''  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at",
    )
    .eq("organization_id", organization)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", FINAL_RELEASE_SOURCE)
    .eq("active", true)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (result.error) throw result.error;

  const ranked = rankAvantiqoKnowledgeRows({
    rows: result.data,
''',
    '''  const [result, receiptResult] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select(
        "id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at",
      )
      .eq("organization_id", organization)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("source", FINAL_RELEASE_SOURCE)
      .eq("active", true)
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(MAX_CANDIDATES),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,organization_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organization)
      .eq("memory_scope", AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_SCOPE)
      .eq("active", true)
      .limit(MAX_CANDIDATES),
  ]);
  if (result.error) throw result.error;
  if (receiptResult.error) throw receiptResult.error;

  const receiptVerifier = createAvantiqoFinalKnowledgeReleaseReceiptVerifier();
  const receiptsByMemoryKey = new Map(
    list(receiptResult.data)
      .filter((receipt) => receiptVerifier.available === true && receiptVerifier.verify(receipt))
      .map((receipt) => [text(receipt.memory_key, 240), receipt]),
  );
  const rowsWithReceiptProof = list(result.data).map((row) => {
    const metadata = object(row.metadata);
    const receipt = receiptsByMemoryKey.get(text(metadata.final_release_receipt_memory_key, 240));
    const receiptMetadata = object(receipt?.metadata);
    const verified = Boolean(
      receipt?.id &&
      text(receiptMetadata.release_memory_key, 240) === text(row.memory_key, 240) &&
      text(receiptMetadata.release_id, 128) === text(metadata.release_id, 128) &&
      text(receiptMetadata.authorization_id, 128) === text(metadata.final_release_authorization_id, 128) &&
      text(receiptMetadata.provisional_claim_digest, 64) === text(metadata.provisional_claim_digest, 64)
    );
    return { ...row, _immutable_release_receipt_verified: verified };
  });

  const ranked = rankAvantiqoKnowledgeRows({
    rows: rowsWithReceiptProof,
''',
)

# Atomic migration was not deployed anywhere: evolve the pending contract cleanly instead of creating
# a second migration that depends on an unapplied predecessor.
path = "supabase/migrations/20260905065000_atomic_final_knowledge_release.sql"
replace_exact(
    path,
    '  p_candidate_metadata jsonb,\n  p_provisional_metadata jsonb,\n  p_committed_at timestamptz\n',
    '  p_candidate_metadata jsonb,\n  p_provisional_metadata jsonb,\n  p_receipt_row jsonb,\n  p_transaction_id uuid,\n  p_committed_at timestamptz\n',
    count=3,
)
replace_exact(
    path,
    '  v_release_id uuid;\n  v_consumption_memory_key text;\n',
    '  v_release_id uuid;\n  v_receipt_id uuid;\n  v_consumption_memory_key text;\n  v_receipt_memory_key text;\n',
)
replace_exact(
    path,
    '  v_release_metadata jsonb;\n  v_consumption_metadata jsonb;\n',
    '  v_release_metadata jsonb;\n  v_consumption_metadata jsonb;\n  v_receipt_metadata jsonb;\n',
)
replace_exact(
    path,
    "  if p_committed_at is null then\n    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMITTED_AT_REQUIRED';\n  end if;\n",
    "  if p_committed_at is null or p_transaction_id is null then\n    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_TRANSACTION_ID_AND_TIME_REQUIRED';\n  end if;\n  if abs(extract(epoch from (transaction_timestamp() - p_committed_at))) > 60 then\n    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_TIME_SKEW_EXCEEDED';\n  end if;\n",
)
replace_exact(
    path,
    "  v_release_metadata := coalesce(p_release_row->'metadata', '{}'::jsonb);\n  v_consumption_memory_key := coalesce(p_consumption_row->>'memory_key', '');\n  v_release_memory_key := coalesce(p_release_row->>'memory_key', '');\n",
    "  v_release_metadata := coalesce(p_release_row->'metadata', '{}'::jsonb);\n  v_receipt_metadata := coalesce(p_receipt_row->'metadata', '{}'::jsonb);\n  v_consumption_memory_key := coalesce(p_consumption_row->>'memory_key', '');\n  v_release_memory_key := coalesce(p_release_row->>'memory_key', '');\n  v_receipt_memory_key := coalesce(p_receipt_row->>'memory_key', '');\n",
)
receipt_validation_anchor = """  if coalesce(p_candidate_metadata->>'production_knowledge_release_authorization_id', '') <> v_authorization_id_text
"""
receipt_validation = """  if coalesce(p_receipt_row->>'organization_id', '') <> p_organization_id::text
     or coalesce(p_receipt_row->>'memory_scope', '') <> 'platform_learning_knowledge_release_receipts'
     or coalesce(p_receipt_row->>'memory_type', '') <> 'completed_step'
     or coalesce(p_receipt_row->>'source', '') <> 'immutable_final_knowledge_release_receipt'
     or coalesce(v_receipt_metadata->>'contract', '') <> 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_V1'
     or coalesce(v_receipt_metadata->>'status', '') <> 'COMMITTED'
     or coalesce(v_receipt_metadata->>'receipt_immutable', 'false') <> 'true'
     or coalesce(v_receipt_metadata->>'receipt_append_only', 'false') <> 'true'
     or coalesce(v_receipt_metadata->>'transaction_atomic', 'false') <> 'true'
     or coalesce(v_receipt_metadata->>'partial_release_state_allowed', 'true') <> 'false'
     or coalesce(v_receipt_metadata->>'transaction_id', '') <> p_transaction_id::text
     or nullif(v_receipt_metadata->>'committed_at', '')::timestamptz <> p_committed_at
     or coalesce(v_receipt_metadata->>'authorization_id', '') <> v_authorization_id_text
     or coalesce(v_receipt_metadata->>'authorization_memory_key', '') <> v_authorization.memory_key
     or coalesce(v_receipt_metadata->>'authorization_signature', '') <> coalesce(v_authorization.metadata->>'release_authorization_signature', '')
     or coalesce(v_receipt_metadata->>'authorization_consumption_memory_key', '') <> v_consumption_memory_key
     or coalesce(v_receipt_metadata->>'candidate_id', '') <> v_candidate.id::text
     or coalesce(v_receipt_metadata->>'candidate_memory_key', '') <> v_candidate_memory_key
     or coalesce(v_receipt_metadata->>'candidate_authenticity_mac', '') <> v_candidate_mac
     or coalesce(v_receipt_metadata->>'provisional_id', '') <> v_provisional.id::text
     or coalesce(v_receipt_metadata->>'provisional_claim_memory_key', '') <> v_provisional.memory_key
     or coalesce(v_receipt_metadata->>'provisional_claim_digest', '') <> v_claim_digest
     or coalesce(v_receipt_metadata->>'release_memory_key', '') <> v_release_memory_key
     or coalesce(v_receipt_metadata->>'release_id', '') <> coalesce(v_release_metadata->>'release_id', '')
     or coalesce(v_receipt_metadata->>'released_knowledge_authenticity_mac_at_release', '') <> coalesce(v_release_metadata->>'released_knowledge_authenticity_mac', '')
     or coalesce(v_receipt_metadata->>'release_receipt_signature_contract', '') <> 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_V1'
     or coalesce(v_receipt_metadata->>'release_receipt_signature_algorithm', '') <> 'Ed25519'
     or coalesce(v_receipt_metadata->>'release_receipt_signature_key_id', '') = ''
     or coalesce(v_receipt_metadata->>'release_receipt_signature', '') = ''
     or coalesce(v_receipt_metadata->>'receipt_mutation_allowed', 'true') <> 'false'
     or coalesce(v_receipt_metadata->>'replay_allowed', 'true') <> 'false' then
    raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_IMMUTABLE_RECEIPT_INVALID';
  end if;

""" + receipt_validation_anchor
replace_exact(path, receipt_validation_anchor, receipt_validation)
release_insert_end = """  ) returning id into v_release_id;

  update public.intelligence_memories
"""
receipt_insert = """  ) returning id into v_release_id;

  insert into public.intelligence_memories (
    organization_id, party_id, entity_id, conversation_id, source_turn_id,
    memory_scope, memory_key, memory_type, subject, content,
    importance, confidence, source, active, valid_until,
    superseded_by, superseded_at, forgotten_at, metadata, updated_at
  ) values (
    p_organization_id, nullif(p_receipt_row->>'party_id', '')::uuid,
    nullif(p_receipt_row->>'entity_id', '')::uuid, nullif(p_receipt_row->>'conversation_id', '')::uuid,
    nullif(p_receipt_row->>'source_turn_id', '')::uuid, p_receipt_row->>'memory_scope', v_receipt_memory_key,
    p_receipt_row->>'memory_type', p_receipt_row->>'subject', p_receipt_row->>'content',
    coalesce((p_receipt_row->>'importance')::numeric, 1), coalesce((p_receipt_row->>'confidence')::numeric, 1),
    p_receipt_row->>'source', true, nullif(p_receipt_row->>'valid_until', '')::timestamptz,
    nullif(p_receipt_row->>'superseded_by', '')::uuid, nullif(p_receipt_row->>'superseded_at', '')::timestamptz,
    nullif(p_receipt_row->>'forgotten_at', '')::timestamptz, v_receipt_metadata, p_committed_at
  ) returning id into v_receipt_id;

  update public.intelligence_memories
"""
replace_exact(path, release_insert_end, receipt_insert)
replace_exact(
    path,
    "    'release_id', v_release_id,\n    'candidate_memory_key', v_candidate_memory_key,\n",
    "    'release_id', v_release_id,\n    'transaction_id', p_transaction_id,\n    'release_receipt_persisted', true,\n    'release_receipt_memory_key', v_receipt_memory_key,\n    'release_receipt_id', v_receipt_id,\n    'candidate_memory_key', v_candidate_memory_key,\n",
)
replace_exact(
    path,
    "comment on function public.avantiqo_commit_final_knowledge_release(\n  uuid, uuid, text, timestamptz, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, timestamptz\n) is 'Atomically consumes one signed final-knowledge release authorization, inserts its one-use receipt and released knowledge row, finalizes the exact candidate, and supersedes the exact provisional claim. SECURITY INVOKER; service_role only; cryptographic verification occurs in the server runtime before this transaction boundary.';\n\ncommit;\n",
    "comment on function public.avantiqo_commit_final_knowledge_release(\n  uuid, uuid, text, timestamptz, uuid, timestamptz, uuid, timestamptz, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, timestamptz\n) is 'Atomically consumes one signed final-knowledge release authorization, inserts one-use consumption evidence, released knowledge and its immutable Ed25519 receipt, finalizes the exact candidate, and supersedes the exact provisional claim. SECURITY INVOKER; service_role only; cryptographic verification occurs in the server runtime before this transaction boundary.';\n\ncreate or replace function public.avantiqo_block_final_knowledge_release_receipt_mutation()\nreturns trigger\nlanguage plpgsql\nsecurity invoker\nset search_path = public\nas $$\nbegin\n  raise exception 'AVANTIQO_FINAL_KNOWLEDGE_RELEASE_RECEIPT_IMMUTABLE';\nend;\n$$;\n\nrevoke all on function public.avantiqo_block_final_knowledge_release_receipt_mutation() from public, anon, authenticated;\n\ndrop trigger if exists trg_avantiqo_final_knowledge_release_receipt_immutable on public.intelligence_memories;\ncreate trigger trg_avantiqo_final_knowledge_release_receipt_immutable\nbefore update or delete on public.intelligence_memories\nfor each row\nwhen (old.memory_scope = 'platform_learning_knowledge_release_receipts')\nexecute function public.avantiqo_block_final_knowledge_release_receipt_mutation();\n\ncommit;\n",
)

# Workflow paths and syntax/run gates for the new receipt runtime/audit.
path = ".github/workflows/avantiqo-final-promotion-candidate-authenticity-audit.yml"
replace_exact(
    path,
    '      - "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js"\n',
    '      - "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js"\n      - "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js"\n',
    count=2,
)
replace_exact(
    path,
    '      - "scripts/audit-avantiqo-final-knowledge-release-authority-atomicity-local.mjs"\n',
    '      - "scripts/audit-avantiqo-final-knowledge-release-authority-atomicity-local.mjs"\n      - "scripts/audit-avantiqo-final-knowledge-release-immutable-receipt-local.mjs"\n',
    count=2,
)
replace_exact(
    path,
    '          node --check lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js\n',
    '          node --check lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js\n          node --check lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseReceiptAuthenticityRuntime.js\n',
)
replace_exact(
    path,
    '          node --check scripts/audit-avantiqo-final-knowledge-release-authority-atomicity-local.mjs\n',
    '          node --check scripts/audit-avantiqo-final-knowledge-release-authority-atomicity-local.mjs\n          node --check scripts/audit-avantiqo-final-knowledge-release-immutable-receipt-local.mjs\n',
)
replace_exact(
    path,
    '      - name: Run authenticated authority and atomicity audit\n        run: node scripts/audit-avantiqo-final-knowledge-release-authority-atomicity-local.mjs\n',
    '      - name: Run authenticated authority and atomicity audit\n        run: node scripts/audit-avantiqo-final-knowledge-release-authority-atomicity-local.mjs\n\n      - name: Run immutable final release receipt adversarial audit\n        run: node --loader ./scripts/next-alias-loader.mjs scripts/audit-avantiqo-final-knowledge-release-immutable-receipt-local.mjs\n',
)

print("AVANTIQO_P3_IMMUTABLE_RELEASE_RECEIPT_PATCH_APPLIED")
