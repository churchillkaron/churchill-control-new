from pathlib import Path

path = Path("lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js")
source = path.read_text()

def replace_exact(before, after, label):
    global source
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, found {count}")
    source = source.replace(before, after, 1)

replace_exact(
'''  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONSUMPTION_SCOPE,
  createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier,
  verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding,
} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
''',
'''  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE,
  createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier,
  verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding,
} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT,
  commitAvantiqoFinalKnowledgeReleaseAtomically,
} from "./AvantiqoFinalKnowledgeReleaseAtomicCommitRuntime.js";
''',
"atomic runtime import",
)

start = source.index("async function consumeFinalReleaseAuthorization(")
end = source.index("\nexport async function releaseAvantiqoFinalKnowledge", start)
source = source[:start] + source[end+1:]

replace_exact(
'''  const nowIso = new Date().toISOString();
  const authorizationConsumption = await consumeFinalReleaseAuthorization({
    organizationId,
    authorization,
    nowIso,
  });
  const releaseDraft = knowledgeRow({
''',
'''  const nowIso = new Date().toISOString();
  const authorizationId = text(authorizationMetadata.authorization_id, 128);
  if (!authorizationId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_ID_REQUIRED`);
  }
  const authorizationConsumption = {
    authorization_id: authorizationId,
    consumption_memory_key: `final-knowledge-release-authorization-consumed:${authorizationId.slice(0, 40)}`,
    approver_id: text(authorizationMetadata.approver_id, 160),
    approval_reason: approvalReason,
  };
  const releaseDraft = knowledgeRow({
''',
"prepare authorization receipt identity without consuming",
)

old = '''  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,confidence,valid_until,metadata,updated_at")
    .single();
  if (written.error) throw written.error;

  const candidateMetadata = object(state.candidate.metadata);
  const candidateUpdate = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      metadata: {
        ...candidateMetadata,
        status: "FINAL_KNOWLEDGE_RELEASED",
        production_knowledge_release_authorized: true,
        production_knowledge_release_authorization_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
        production_knowledge_release_authorization_id: authorizationConsumption.authorization_id,
        production_knowledge_release_authorization_consumed: true,
        platform_knowledge_written: true,
        release_memory_key: row.memory_key,
        release_id: row.metadata.release_id,
        released_at: nowIso,
      },
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", state.candidate.id)
    .eq("updated_at", state.candidate.updated_at)
    .select("id")
    .maybeSingle();
  if (candidateUpdate.error) throw candidateUpdate.error;
  if (!candidateUpdate.data?.id) {
    const rollback = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        forgotten_at: nowIso,
        metadata: {
          ...row.metadata,
          release_status: "QUARANTINED_RELEASE_FINALIZATION_CONFLICT",
          reusable_platform_knowledge: false,
          knowledge_router_reuse_allowed: false,
          quarantined_at: nowIso,
          quarantine_reason: "FINAL_CANDIDATE_OPTIMISTIC_UPDATE_CONFLICT",
        },
        updated_at: nowIso,
      })
      .eq("organization_id", organizationId)
      .eq("id", written.data.id);
    if (rollback.error) throw rollback.error;
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_FINALIZATION_CONFLICT_RELEASE_QUARANTINED`);
  }

  const provisionalMetadataAfter = object(state.provisional.metadata);
  const provisionalUpdate = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      superseded_by: written.data.id,
      superseded_at: nowIso,
      metadata: {
        ...provisionalMetadataAfter,
        status: "PROMOTED_TO_EXPLICITLY_RELEASED_PLATFORM_KNOWLEDGE",
        released_knowledge_memory_key: row.memory_key,
        released_at: nowIso,
        reusable_platform_knowledge: false,
        knowledge_router_reuse_allowed: false,
        automatic_knowledge_promotion: false,
      },
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", state.provisional.id)
    .eq("updated_at", state.provisional.updated_at);
  if (provisionalUpdate.error) throw provisionalUpdate.error;
'''
new = '''  const atomicCommit = await commitAvantiqoFinalKnowledgeReleaseAtomically({
    organizationId,
    authorization,
    candidate: state.candidate,
    provisional: state.provisional,
    releaseRow: row,
    nowIso,
  });
  if (atomicCommit.receipt?.transaction_atomic !== true) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_ATOMIC_COMMIT_REQUIRED`);
  }
'''
replace_exact(old, new, "replace multi-write release with atomic commit")

replace_exact(
'''      release_authorization_replay_allowed: false,
      global_release_approval_switch_sufficient: false,
''',
'''      release_authorization_replay_allowed: false,
      global_release_approval_switch_sufficient: false,
      final_release_transaction_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_CONTRACT,
      final_release_transaction_atomic: true,
      partial_release_state_allowed: false,
''',
"atomic governance truth",
)

path.write_text(source)
print("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_ATOMIC_COMMIT_WIRED")
