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
'''import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
  createAvantiqoReleasedKnowledgeAuthenticityVerifier,
  sealAvantiqoReleasedKnowledgeAuthenticity,
} from "./AvantiqoReleasedKnowledgeAuthenticityRuntime.js";
''',
'''import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
  createAvantiqoReleasedKnowledgeAuthenticityVerifier,
  sealAvantiqoReleasedKnowledgeAuthenticity,
} from "./AvantiqoReleasedKnowledgeAuthenticityRuntime.js";
import {
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE,
  AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONSUMPTION_SCOPE,
  createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier,
  verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding,
} from "./AvantiqoFinalKnowledgeReleaseAuthorizationAuthenticityRuntime.js";
''', "authorization import")

replace_exact(
'''const RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const RELEASE_APPROVAL_ENV = "AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED";
const MAX_ROWS = 500;
''',
'''const RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const MAX_ROWS = 500;
''', "remove global approval env")

replace_exact(
'''function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

''', '', "remove global approval parser")

anchor = '''async function writeEvent(row) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data?.id);
}

'''
helpers = anchor + '''async function loadFinalReleaseAuthorization(organizationId, authorizationMemoryKey) {
  const key = text(authorizationMemoryKey, 240);
  if (!key.startsWith("final-knowledge-release-authorization:")) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_REQUIRED`);
  }
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_SCOPE)
    .eq("memory_key", key)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_NOT_FOUND`);
  }
  return result.data;
}

async function consumeFinalReleaseAuthorization({ organizationId, authorization, nowIso }) {
  const metadata = object(authorization.metadata);
  const authorizationId = text(metadata.authorization_id, 128);
  if (!authorizationId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_ID_REQUIRED`);
  }
  const consumptionRow = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONSUMPTION_SCOPE,
    memory_key: `final-knowledge-release-authorization-consumed:${authorizationId.slice(0, 40)}`,
    memory_type: "completed_step",
    subject: authorization.subject,
    content: "Signed final knowledge release authorization consumed exactly once.",
    importance: 1,
    confidence: 1,
    source: "final_knowledge_release_authorization_consumption",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
      authorization_id: authorizationId,
      authorization_memory_key: authorization.memory_key,
      authorization_signature_key_id: text(metadata.release_authorization_signature_key_id, 80) || null,
      hypothesis_fingerprint: text(metadata.hypothesis_fingerprint, 128) || null,
      candidate_memory_key: text(metadata.candidate_memory_key, 240) || null,
      provisional_claim_digest: text(metadata.provisional_claim_digest, 64) || null,
      approver_id: text(metadata.approver_id, 160) || null,
      consumed_at: nowIso,
      one_use_enforced_by_unique_memory_key: true,
      replay_allowed: false,
      automatic_release_allowed: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_effect: "FINAL_KNOWLEDGE_RELEASE_ONLY",
    },
    updated_at: nowIso,
  };
  const consumption = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(consumptionRow)
    .select("id")
    .maybeSingle();
  if (consumption.error) {
    if (String(consumption.error?.code || "") === "23505") {
      throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_ALREADY_CONSUMED`);
    }
    throw consumption.error;
  }
  if (!consumption.data?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_CONSUMPTION_FAILED`);
  }
  const consumed = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      metadata: {
        ...metadata,
        status: "CONSUMED",
        consumed_at: nowIso,
        consumption_memory_key: consumptionRow.memory_key,
      },
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", authorization.id)
    .eq("updated_at", authorization.updated_at)
    .eq("active", true)
    .select("id")
    .maybeSingle();
  if (consumed.error) throw consumed.error;
  if (!consumed.data?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_OPTIMISTIC_CONSUMPTION_CONFLICT`);
  }
  return {
    authorization_id: authorizationId,
    consumption_memory_key: consumptionRow.memory_key,
    approver_id: text(metadata.approver_id, 160),
    approval_reason: text(metadata.approval_reason, 800),
  };
}

'''
replace_exact(anchor, helpers, "authorization helpers")

replace_exact(
'''export async function releaseAvantiqoFinalKnowledge({
  hypothesis_fingerprint,
  approval_reason,
  release_note = null,
} = {}) {
  if (!enabled(process.env[RELEASE_APPROVAL_ENV])) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXPLICIT_APPROVAL_REQUIRED`);
  }
  const approvalReason = text(approval_reason, 800);
  if (!approvalReason) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_APPROVAL_REASON_REQUIRED`);
  }
''',
'''export async function releaseAvantiqoFinalKnowledge({
  hypothesis_fingerprint,
  authorization_memory_key,
  release_note = null,
} = {}) {
''', "release signature and global switch")

replace_exact(
'''  if (!verifyAvantiqoFinalPromotionCandidateClaimBinding(state.candidate, state.provisional)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_PROVISIONAL_CLAIM_BINDING_MISMATCH`);
  }

  const provisionalMetadata = object(state.provisional.metadata);
''',
'''  if (!verifyAvantiqoFinalPromotionCandidateClaimBinding(state.candidate, state.provisional)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_PROVISIONAL_CLAIM_BINDING_MISMATCH`);
  }

  const authorization = await loadFinalReleaseAuthorization(organizationId, authorization_memory_key);
  const authorizationVerifier = createAvantiqoFinalKnowledgeReleaseAuthorizationVerifier();
  if (authorizationVerifier.available !== true) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_PUBLIC_KEYRING_REQUIRED`);
  }
  if (!authorizationVerifier.verify(authorization)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_INVALID_OR_EXPIRED`);
  }
  if (!verifyAvantiqoFinalKnowledgeReleaseAuthorizationBinding(authorization, state.candidate, state.provisional)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_BINDING_MISMATCH`);
  }
  const authorizationMetadata = object(authorization.metadata);
  const approvalReason = text(authorizationMetadata.approval_reason, 800);
  if (!approvalReason) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SIGNED_RELEASE_AUTHORIZATION_REASON_REQUIRED`);
  }

  const provisionalMetadata = object(state.provisional.metadata);
''', "verify authorization after exact claim binding")

replace_exact(
'''  const nowIso = new Date().toISOString();
  const releaseDraft = knowledgeRow({
''',
'''  const nowIso = new Date().toISOString();
  const authorizationConsumption = await consumeFinalReleaseAuthorization({
    organizationId,
    authorization,
    nowIso,
  });
  const releaseDraft = knowledgeRow({
''', "consume authorization before release persistence")

replace_exact(
'''      approval_reason: text(approvalReason, 800),
      release_note: text(releaseNote, 1200) || null,
''',
'''      approval_reason: text(approvalReason, 800),
      final_release_authorization_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
      final_release_authorization_id: text(authorizationConsumption?.authorization_id, 128) || null,
      final_release_authorization_consumption_memory_key: text(authorizationConsumption?.consumption_memory_key, 240) || null,
      final_release_authorized_by: text(authorizationConsumption?.approver_id, 160) || null,
      final_release_authorization_one_use_consumed: true,
      release_note: text(releaseNote, 1200) || null,
''', "bind authorization receipt into released row")

replace_exact(
'''        production_knowledge_release_authorized: true,
        platform_knowledge_written: true,
''',
'''        production_knowledge_release_authorized: true,
        production_knowledge_release_authorization_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
        production_knowledge_release_authorization_id: authorizationConsumption.authorization_id,
        production_knowledge_release_authorization_consumed: true,
        platform_knowledge_written: true,
''', "bind authorization to candidate finalization")

replace_exact(
'''    explicit_approval_required: true,
    source_count: support.source_count,
''',
'''    explicit_approval_required: true,
    signed_candidate_specific_authorization_required: true,
    release_authorization_id: authorizationConsumption.authorization_id,
    release_authorization_consumed: true,
    source_count: support.source_count,
''', "release result authorization truth")

replace_exact(
'''      final_promotion_candidate_authenticity_verified: true,
      exact_provisional_claim_binding_verified: true,
''',
'''      final_promotion_candidate_authenticity_verified: true,
      exact_provisional_claim_binding_verified: true,
      final_release_authorization_contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_CONTRACT,
      candidate_specific_signed_release_authorization_verified: true,
      release_authorization_one_use_consumed: true,
      release_authorization_replay_allowed: false,
      global_release_approval_switch_sufficient: false,
''', "governance authorization truth")

path.write_text(source)
print("AVANTIQO_FINAL_KNOWLEDGE_RELEASE_AUTHORIZATION_WIRING_PATCHED")
