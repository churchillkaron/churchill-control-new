import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_GENERAL_INTELLIGENCE_MASTERY_EVIDENCE_CONTRACT =
  "AVANTIQO_GENERAL_INTELLIGENCE_MASTERY_EVIDENCE_V1";

const MEMORY_TABLE = "intelligence_memories";
const RETENTION_SCOPE = "platform_general_intelligence_retention";
const TRANSFER_SCOPE = "platform_general_intelligence_transfer_practice";
const MASTERY_EVIDENCE_SCOPE = "platform_general_intelligence_mastery_evidence";
const AGENDA_SCOPE = "platform_learning_agenda";
const MAX_PREREQUISITES = 3;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function strongRetention(rows) {
  const ordered = [...rows].sort((left, right) =>
    Number(object(left.metadata).retention_day || 0) - Number(object(right.metadata).retention_day || 0),
  );
  const strong = ordered.filter((row) => Number(object(row.metadata).score || 0) >= 0.85);
  const maxDay = Math.max(0, ...ordered.map((row) => Number(object(row.metadata).retention_day || 0)));
  const worstForgetting = Math.max(0, ...ordered.map((row) => Number(object(row.metadata).forgetting_score || 0)));
  return {
    strong_count: strong.length,
    max_retention_day: maxDay,
    worst_forgetting_score: Number(worstForgetting.toFixed(4)),
    retention_gate_passed: strong.length >= 3 && maxDay >= 7 && worstForgetting <= 0.15,
  };
}

function prerequisiteAgendaRow({ organizationId, transfer, prerequisite, index, nowIso }) {
  const metadata = object(transfer.metadata);
  const sourceTopic = text(metadata.source_topic_key, 240);
  const targetTopic = text(metadata.target_topic_key, 240);
  const targetDomain = text(metadata.target_domain, 120) || "general-intelligence";
  const key = digest("general-intelligence-prerequisite", sourceTopic, targetTopic, prerequisite);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: `agenda:${key.slice(0, 40)}`,
    memory_type: "goal",
    subject: `world-prerequisite-${key.slice(0, 20)}`,
    content: [
      `Investigate whether the proposed prerequisite "${prerequisite}" is actually required to reason correctly about transfer from ${sourceTopic} to ${targetTopic}.`,
      "Prefer primary, authoritative, peer-reviewed, or standards-based evidence.",
      "Treat the prerequisite as an unverified study proposal until evidence supports it.",
      "Identify boundary conditions, counterexamples, and whether a narrower prerequisite would be more accurate.",
    ].join(" "),
    importance: Math.min(0.96, 0.84 + index * 0.02),
    confidence: 0.55,
    source: "general_intelligence_prerequisite_agenda",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_GENERAL_INTELLIGENCE_MASTERY_EVIDENCE_CONTRACT,
      continuous_learning: true,
      self_directed_learning: true,
      general_intelligence_curriculum: true,
      education_scope: "WORLD_KNOWLEDGE",
      research_mode: "mechanism",
      topic_key: `world-prerequisite-${key.slice(0, 20)}`,
      parent_topic_key: targetTopic,
      source_topic_key: sourceTopic,
      target_topic_key: targetTopic,
      knowledge_domain: targetDomain,
      proposed_prerequisite: prerequisite,
      prerequisite_verified: false,
      status: "READY",
      next_research_at: nowIso,
      automatic_knowledge_promotion: false,
      automatic_mastery_promotion: false,
      automatic_model_training: false,
      automatic_model_promotion: false,
      customer_private_content_allowed: false,
      authorization_value: "none",
      created_at: nowIso,
    },
    updated_at: nowIso,
  };
}

export async function reconcileAvantiqoGeneralIntelligenceMasteryEvidence({
  organizationId = learningOrganizationId(),
} = {}) {
  if (!organizationId) {
    return {
      success: true,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_ID_REQUIRED",
      contract: AVANTIQO_GENERAL_INTELLIGENCE_MASTERY_EVIDENCE_CONTRACT,
    };
  }

  const [retentionResult, transferResult] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("subject,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RETENTION_SCOPE)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", TRANSFER_SCOPE)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);
  if (retentionResult.error) throw retentionResult.error;
  if (transferResult.error) throw transferResult.error;

  const retentionRows = list(retentionResult.data);
  const transferRows = list(transferResult.data);
  const nowIso = new Date().toISOString();
  const prerequisiteRows = [];
  const masteryRows = [];

  for (const transfer of transferRows) {
    const metadata = object(transfer.metadata);
    const sourceTopic = text(metadata.source_topic_key, 240);
    if (!sourceTopic.startsWith("world-")) continue;
    const sourceRetention = retentionRows.filter((row) => row.subject === sourceTopic);
    const retention = strongRetention(sourceRetention);
    const transferPassed = metadata.passed === true && Number(metadata.score || 0) >= 0.8;
    const verdict = text(object(metadata.grading).verdict || object(metadata.transfer_output).verdict, 60).toUpperCase();
    const supportedTransferHypothesis = transferPassed && verdict === "TRANSFER_HYPOTHESIS";

    if (retention.retention_gate_passed && transferPassed) {
      const targetTopic = text(metadata.target_topic_key, 240);
      const key = digest("general-intelligence-mastery-evidence", sourceTopic, targetTopic);
      masteryRows.push({
        organization_id: organizationId,
        party_id: null,
        entity_id: null,
        conversation_id: null,
        source_turn_id: null,
        memory_scope: MASTERY_EVIDENCE_SCOPE,
        memory_key: `mastery-evidence:${key.slice(0, 40)}`,
        memory_type: "evidence",
        subject: sourceTopic,
        content: `General intelligence mastery evidence candidate for ${sourceTopic}.`,
        importance: 0.88,
        confidence: 0.8,
        source: "general_intelligence_mastery_evidence",
        active: true,
        valid_until: null,
        superseded_by: null,
        superseded_at: null,
        forgotten_at: null,
        metadata: {
          contract: AVANTIQO_GENERAL_INTELLIGENCE_MASTERY_EVIDENCE_CONTRACT,
          topic_key: sourceTopic,
          transfer_target_topic_key: targetTopic,
          retention_gate_passed: true,
          strong_retention_count: retention.strong_count,
          max_retention_day: retention.max_retention_day,
          worst_forgetting_score: retention.worst_forgetting_score,
          transfer_gate_passed: true,
          transfer_score: Number(metadata.score || 0),
          transfer_verdict: verdict,
          supported_transfer_hypothesis: supportedTransferHypothesis,
          mastery_evidence_candidate: true,
          stable_mastery_granted: false,
          existing_mastery_frontier_gate_still_required: true,
          operational_validation_still_required: true,
          reusable_released_knowledge_still_required: true,
          automatic_mastery_promotion: false,
          automatic_knowledge_promotion: false,
          automatic_model_training: false,
          automatic_model_promotion: false,
          customer_private_content_included: false,
          raw_reasoning_persisted: false,
          authorization_value: "none",
          created_at: nowIso,
        },
        updated_at: nowIso,
      });
    }

    if (!supportedTransferHypothesis) {
      const prerequisites = list(metadata.missing_prerequisites || object(metadata.transfer_output).missing_prerequisites)
        .map((item) => text(item, 800))
        .filter(Boolean)
        .slice(0, MAX_PREREQUISITES);
      prerequisites.forEach((prerequisite, index) => {
        prerequisiteRows.push(prerequisiteAgendaRow({
          organizationId,
          transfer,
          prerequisite,
          index,
          nowIso,
        }));
      });
    }
  }

  if (masteryRows.length) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(masteryRows, { onConflict: "organization_id,memory_scope,memory_key" })
      .select("id");
    if (result.error) throw result.error;
  }
  if (prerequisiteRows.length) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(prerequisiteRows, {
        onConflict: "organization_id,memory_scope,memory_key",
        ignoreDuplicates: true,
      })
      .select("id");
    if (result.error) throw result.error;
  }

  return {
    success: true,
    status: "RECONCILED",
    contract: AVANTIQO_GENERAL_INTELLIGENCE_MASTERY_EVIDENCE_CONTRACT,
    mastery_evidence_candidate_count: masteryRows.length,
    prerequisite_agenda_count: prerequisiteRows.length,
    stable_mastery_granted: false,
    automatic_mastery_promotion: false,
    automatic_knowledge_promotion: false,
    automatic_model_training: false,
    automatic_model_promotion: false,
  };
}
