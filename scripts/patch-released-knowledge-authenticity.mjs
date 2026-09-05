import fs from "node:fs";

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`PATCH_ANCHOR_NOT_FOUND:${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`PATCH_ANCHOR_NOT_UNIQUE:${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function patchFinalRelease() {
  const path = "lib/intelligence/runtime/AvantiqoFinalKnowledgeReleaseRuntime.js";
  let source = fs.readFileSync(path, "utf8");

  source = replaceOnce(source,
`import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateAuthenticityVerifier,
  verifyAvantiqoFinalPromotionCandidateClaimBinding,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";
`,
`import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateAuthenticityVerifier,
  verifyAvantiqoFinalPromotionCandidateClaimBinding,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";
import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
  createAvantiqoReleasedKnowledgeAuthenticityVerifier,
  sealAvantiqoReleasedKnowledgeAuthenticity,
} from "./AvantiqoReleasedKnowledgeAuthenticityRuntime.js";
`, "final-release-import");

  source = replaceOnce(source,
`.select("id,memory_key,subject,content,confidence,active,valid_until,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("source", RELEASE_SOURCE)
      .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)`,
`.select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("source", RELEASE_SOURCE)
      .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)`, "existing-release-full-shape");

  source = replaceOnce(source,
`      explicit_final_release_approved: true,
      approval_reason: text(approvalReason, 800),`,
`      explicit_final_release_approved: true,
      released_knowledge_authenticity_required: true,
      released_knowledge_authenticity_contract:
        AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
      unsigned_legacy_release_compatibility_allowed: false,
      database_only_released_claim_mutation_allowed: false,
      approval_reason: text(approvalReason, 800),`, "release-metadata-auth-policy");

  source = replaceOnce(source,
`  if (state.existingRelease?.id) {
    return {
      success: true,
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      status: "ALREADY_RELEASED",
      release_memory_key: state.existingRelease.memory_key,
      platform_knowledge_written: false,
      idempotent: true,
    };
  }`,
`  if (state.existingRelease?.id) {
    const releasedKnowledgeVerifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
    if (releasedKnowledgeVerifier.available !== true) {
      throw new Error(
        \`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED\`,
      );
    }
    if (!releasedKnowledgeVerifier.verify(state.existingRelease)) {
      throw new Error(
        \`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXISTING_RELEASE_AUTHENTICITY_REQUIRED\`,
      );
    }
    return {
      success: true,
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      status: "ALREADY_RELEASED_AUTHENTICATED",
      release_memory_key: state.existingRelease.memory_key,
      platform_knowledge_written: false,
      released_knowledge_authenticity_verified: true,
      idempotent: true,
    };
  }`, "existing-release-auth-gate");

  source = replaceOnce(source,
`  const row = knowledgeRow({
    organizationId,
    candidate: state.candidate,
    provisional: state.provisional,
    support,
    approvalReason,
    releaseNote: release_note,
    nowIso,
  });

  const written = await supabaseAdmin`,
`  const releaseDraft = knowledgeRow({
    organizationId,
    candidate: state.candidate,
    provisional: state.provisional,
    support,
    approvalReason,
    releaseNote: release_note,
    nowIso,
  });
  const releasedKnowledgeSeal = sealAvantiqoReleasedKnowledgeAuthenticity(releaseDraft);
  if (releasedKnowledgeSeal.success !== true || !releasedKnowledgeSeal.row) {
    throw new Error(
      \`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED\`,
    );
  }
  const row = releasedKnowledgeSeal.row;

  const written = await supabaseAdmin`, "release-seal-before-write");

  source = replaceOnce(source,
`      final_promotion_candidate_authenticity_verified: true,
      exact_provisional_claim_binding_verified: true,`,
`      final_promotion_candidate_authenticity_verified: true,
      exact_provisional_claim_binding_verified: true,
      released_knowledge_authenticity_contract:
        AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
      released_knowledge_authenticity_sealed_before_persistence: true,
      database_only_released_claim_mutation_blocks_reuse: true,
      unsigned_legacy_release_compatibility_allowed: false,`, "release-governance-auth");

  source = replaceOnce(source,
`.select("id,memory_key,subject,content,importance,confidence,source,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", RELEASE_SOURCE)`,
`.select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", RELEASE_SOURCE)`, "released-revalidation-full-shape");

  source = replaceOnce(source,
`  const evidenceRows = list(evidenceResult.data).filter((row) => validEvidenceRow(row));
  const nowIso = new Date().toISOString();
  const quarantined = [];
  const healthy = [];

  for (const row of releasedRows) {
    const metadata = object(row.metadata);
    const graph = await inspectAvantiqoEvidenceGraph({`,
`  const evidenceRows = list(evidenceResult.data).filter((row) => validEvidenceRow(row));
  const nowIso = new Date().toISOString();
  const quarantined = [];
  const healthy = [];
  const releasedKnowledgeVerifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
  if (releasedKnowledgeVerifier.available !== true) {
    return {
      success: false,
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      status: "RELEASED_KNOWLEDGE_AUTHENTICITY_BLOCKED",
      reason: "RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED",
      released_knowledge_count: releasedRows.length,
      healthy_count: 0,
      quarantine_count: 0,
      governance: {
        released_knowledge_authenticity_required: true,
        unsigned_legacy_release_compatibility_allowed: false,
        provider_free: true,
        authorization_effect: "NONE",
      },
    };
  }

  for (const row of releasedRows) {
    const metadata = object(row.metadata);
    const authenticityValid = releasedKnowledgeVerifier.verify(row);
    const graph = authenticityValid ? await inspectAvantiqoEvidenceGraph({`, "revalidation-auth-verifier");

  source = replaceOnce(source,
`      matches: [],
      conflicts: [],
    }));
    const support = supportingEvidence(row.content, evidenceRows);
    const reason = quarantineReason(graph, support);`,
`      matches: [],
      conflicts: [],
    })) : {
      contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
      available: false,
      block_knowledge_reuse: true,
      reason: "RELEASED_KNOWLEDGE_AUTHENTICITY_INVALID",
      matches: [],
      conflicts: [],
    };
    const support = authenticityValid ? supportingEvidence(row.content, evidenceRows) : null;
    const reason = authenticityValid
      ? quarantineReason(graph, support)
      : "RELEASED_KNOWLEDGE_AUTHENTICITY_INVALID";`, "revalidation-auth-reason");

  source = replaceOnce(source,
`        const update = await supabaseAdmin
          .from(MEMORY_TABLE)
          .update({
            active: false,
            forgotten_at: nowIso,
            metadata: nextMetadata,
            updated_at: nowIso,
          })`,
`        const quarantinedSeal = sealAvantiqoReleasedKnowledgeAuthenticity({
          ...row,
          active: false,
          forgotten_at: nowIso,
          metadata: {
            ...nextMetadata,
            released_knowledge_authenticity_resealed_for_quarantine: true,
          },
        });
        if (quarantinedSeal.success !== true || !quarantinedSeal.row) {
          throw new Error(
            \`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_QUARANTINE_AUTHENTICITY_RESEAL_REQUIRED\`,
          );
        }
        const update = await supabaseAdmin
          .from(MEMORY_TABLE)
          .update({
            active: false,
            forgotten_at: nowIso,
            metadata: quarantinedSeal.row.metadata,
            updated_at: nowIso,
          })`, "quarantine-reseal");

  source = replaceOnce(source,
`      const update = await supabaseAdmin
        .from(MEMORY_TABLE)
        .update({ metadata: nextMetadata, updated_at: nowIso })`,
`      const revalidatedSeal = sealAvantiqoReleasedKnowledgeAuthenticity({
        ...row,
        metadata: {
          ...nextMetadata,
          released_knowledge_authenticity_resealed_after_revalidation: true,
        },
      });
      if (revalidatedSeal.success !== true || !revalidatedSeal.row) {
        throw new Error(
          \`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_REVALIDATION_AUTHENTICITY_RESEAL_REQUIRED\`,
        );
      }
      const update = await supabaseAdmin
        .from(MEMORY_TABLE)
        .update({ metadata: revalidatedSeal.row.metadata, updated_at: nowIso })`, "healthy-revalidation-reseal");

  source = replaceOnce(source,
`      missing_supporting_source_provenance_quarantines: true,
      quarantine_removes_knowledge_router_visibility: true,`,
`      missing_supporting_source_provenance_quarantines: true,
      invalid_released_knowledge_authenticity_quarantines: true,
      healthy_revalidation_reseals_authenticity: true,
      unsigned_legacy_release_compatibility_allowed: false,
      quarantine_removes_knowledge_router_visibility: true,`, "revalidation-policy-auth");

  fs.writeFileSync(path, source);
}

function patchHybridRetrieval() {
  const path = "lib/intelligence/runtime/AvantiqoHybridKnowledgeRetrievalRuntime.js";
  let source = fs.readFileSync(path, "utf8");

  source = replaceOnce(source,
`import {
  inspectAvantiqoEvidenceGraph,
} from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";
`,
`import {
  inspectAvantiqoEvidenceGraph,
} from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";
import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
  createAvantiqoReleasedKnowledgeAuthenticityVerifier,
} from "@/lib/intelligence/runtime/AvantiqoReleasedKnowledgeAuthenticityRuntime";
`, "hybrid-auth-import");

  source = replaceOnce(source,
`    if (text(metadata.release_status, 120) !== "RELEASED_MONITORED") {
      blockers.push("RELEASED_MONITORED_STATUS_REQUIRED");
    }
    if (metadata.explicit_final_release_approved !== true) {`,
`    if (text(metadata.release_status, 120) !== "RELEASED_MONITORED") {
      blockers.push("RELEASED_MONITORED_STATUS_REQUIRED");
    }
    if (metadata.released_knowledge_authenticity_required !== true) {
      blockers.push("RELEASED_KNOWLEDGE_AUTHENTICITY_REQUIRED_FLAG_MISSING");
    }
    if (
      text(metadata.released_knowledge_authenticity_contract, 180) !==
        AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT
    ) {
      blockers.push("RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT_REQUIRED");
    }
    const releasedKnowledgeVerifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
    if (releasedKnowledgeVerifier.available !== true) {
      blockers.push("RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED");
    } else if (!releasedKnowledgeVerifier.verify(row)) {
      blockers.push("RELEASED_KNOWLEDGE_AUTHENTICITY_INVALID");
    }
    if (metadata.explicit_final_release_approved !== true) {`, "hybrid-admission-auth-gate");

  source = replaceOnce(source,
`      explicit_final_release_required_for_learned_knowledge: true,
      reusable_and_router_flags_required: true,`,
`      explicit_final_release_required_for_learned_knowledge: true,
      released_knowledge_authenticity_required: true,
      database_only_released_claim_mutation_rejected: true,
      unsigned_legacy_release_compatibility_allowed: false,
      reusable_and_router_flags_required: true,`, "hybrid-admission-policy-auth");

  source = replaceOnce(source,
`      "id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at",
    )`,
`      "id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at",
    )`, "hybrid-recall-full-auth-shape");

  source = replaceOnce(source,
`      explicit_final_release_only: true,
      reusable_row_admission_fail_closed: true,`,
`      explicit_final_release_only: true,
      reusable_row_admission_fail_closed: true,
      released_knowledge_authenticity_required: true,
      released_knowledge_authenticity_contract:
        AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,`, "hybrid-retrieval-auth-report");

  source = replaceOnce(source,
`      explicit_final_release_required_for_general_knowledge_reuse: true,
      memory_never_authorizes_actions: true,`,
`      explicit_final_release_required_for_general_knowledge_reuse: true,
      released_knowledge_authenticity_checked_before_reuse: true,
      unsigned_or_forged_released_knowledge_reused: false,
      database_only_released_claim_mutation_reused: false,
      memory_never_authorizes_actions: true,`, "hybrid-governance-auth");

  fs.writeFileSync(path, source);
}

patchFinalRelease();
patchHybridRetrieval();
console.log("AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_WIRING_PATCHED");
