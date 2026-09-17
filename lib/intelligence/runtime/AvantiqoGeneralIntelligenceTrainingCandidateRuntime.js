import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_GENERAL_INTELLIGENCE_TRAINING_CANDIDATE_CONTRACT =
  "AVANTIQO_GENERAL_INTELLIGENCE_TRAINING_CANDIDATE_V1";

const MEMORY_TABLE = "intelligence_memories";
const MASTERY_SCOPE = "platform_general_intelligence_mastery_evidence";
const TRAINING_SCOPE = "platform_training_candidates";
const CANDIDATE_KIND = "GENERAL_INTELLIGENCE_TRANSFER_DISCIPLINE";
const VERIFICATION_MODE = "RETENTION_AND_CROSS_DOMAIN_TRANSFER";
const OUTCOME = "EVIDENCE_BOUND_TRANSFER_REASONING";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function hash(value) { return createHash("sha256").update(String(value ?? "")).digest("hex"); }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }
function capabilityKey(topic) {
  return `intelligence.general.${text(topic, 220).toLowerCase().replace(/^world-/, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}.transfer`;
}
function eligible(row) {
  const m = object(row.metadata);
  return row.active === true && m.mastery_evidence_candidate === true && m.retention_gate_passed === true &&
    m.transfer_gate_passed === true && m.stable_mastery_granted === false &&
    Number(m.strong_retention_count || 0) >= 3 && Number(m.max_retention_day || 0) >= 7 &&
    Number(m.worst_forgetting_score || 1) <= 0.15 && Number(m.transfer_score || 0) >= 0.8 &&
    m.customer_private_content_included === false && m.raw_reasoning_persisted === false;
}
function sourceFingerprint(row) {
  const m = object(row.metadata);
  return hash([m.topic_key, m.transfer_target_topic_key, m.strong_retention_count, m.max_retention_day,
    m.worst_forgetting_score, m.transfer_score, m.transfer_verdict, m.contract].join("|"));
}
function candidateRow(organizationId, row, now) {
  const m = object(row.metadata);
  const topic = text(m.topic_key || row.subject, 240);
  const target = text(m.transfer_target_topic_key, 240);
  const fingerprint = sourceFingerprint(row);
  const capability = capabilityKey(topic);
  return {
    organization_id: organizationId, party_id: null, entity_id: null, conversation_id: null, source_turn_id: null,
    memory_scope: TRAINING_SCOPE, memory_key: `general-intelligence-training:${hash(`${topic}|${target}`).slice(0,40)}`,
    memory_type: "lesson", subject: capability,
    content: "De-identified general-intelligence reasoning candidate. Train evidence-bound cross-domain transfer discipline, not mutable world facts: distinguish evidence from analogy, require source and target evidence, identify invariants and boundary conditions, provide falsifiers, and abstain when transfer is unsupported.",
    importance: 0.9, confidence: 1, source: "general_intelligence_training_candidate", active: true,
    valid_until: null, superseded_by: null, superseded_at: null, forgotten_at: null,
    metadata: {
      contract: AVANTIQO_GENERAL_INTELLIGENCE_TRAINING_CANDIDATE_CONTRACT, candidate_kind: CANDIDATE_KIND,
      capability_key: capability, knowledge_domain: "general-intelligence", source_reference_count: 1,
      source_mastery_evidence_key: row.memory_key, source_topic_key: topic, transfer_target_topic_key: target,
      source_fingerprint: fingerprint, failure_family: [], prior_failure_occurrence_count: 0, outcome: OUTCOME,
      verification_mode: VERIFICATION_MODE, retention_gate_passed: true, transfer_gate_passed: true,
      stable_mastery_granted: false, trains_reasoning_pattern_not_world_facts: true, mutable_world_facts_included: false,
      training_ready: false, benchmark_status: "UNREVIEWED", requires_benchmark_validation: true, benchmark_validated: false,
      customer_private_content_included: false, raw_payload_persisted: false, raw_output_persisted: false,
      raw_reasoning_persisted: false, identifiers_persisted: false, authorization_value: "none",
      automatic_training_started: false, automatic_model_weight_mutation: false, production_model_promotion_effect: "NONE",
      seeded_at: now,
    },
    updated_at: now,
  };
}

export async function seedAvantiqoGeneralIntelligenceTrainingCandidates({ organizationId = learningOrganizationId() } = {}) {
  if (!organizationId) return { contract: AVANTIQO_GENERAL_INTELLIGENCE_TRAINING_CANDIDATE_CONTRACT, status: "DISABLED", reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED", candidate_count: 0 };
  const result = await supabaseAdmin.from(MEMORY_TABLE)
    .select("id,memory_key,subject,active,metadata,updated_at").eq("organization_id", organizationId)
    .eq("memory_scope", MASTERY_SCOPE).eq("active", true).order("updated_at", { ascending: false }).limit(500);
  if (result.error) throw result.error;
  const now = new Date().toISOString();
  const desired = list(result.data).filter(eligible).map((row) => candidateRow(organizationId, row, now));
  const existing = await supabaseAdmin.from(MEMORY_TABLE)
    .select("id,memory_key,active,metadata").eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_SCOPE).eq("source", "general_intelligence_training_candidate").limit(1000);
  if (existing.error) throw existing.error;
  const existingByKey = new Map(list(existing.data).map((row) => [text(row.memory_key, 180), row]));
  const desiredKeys = new Set(desired.map((row) => row.memory_key));
  const changed = desired.filter((row) => {
    const prior = existingByKey.get(row.memory_key);
    return !prior || prior.active !== true || text(object(prior.metadata).source_fingerprint, 128) !== row.metadata.source_fingerprint;
  });
  let writtenCount = 0;
  if (changed.length) {
    const written = await supabaseAdmin.from(MEMORY_TABLE).upsert(changed, { onConflict: "organization_id,memory_scope,memory_key" }).select("id");
    if (written.error) throw written.error;
    writtenCount = list(written.data).length;
  }
  const staleIds = list(existing.data).filter((row) => row.active === true && !desiredKeys.has(text(row.memory_key, 180))).map((row) => row.id).filter(Boolean);
  let retiredCount = 0;
  if (staleIds.length) {
    const retired = await supabaseAdmin.from(MEMORY_TABLE).update({ active: false, superseded_at: now, updated_at: now })
      .eq("organization_id", organizationId).eq("memory_scope", TRAINING_SCOPE)
      .eq("source", "general_intelligence_training_candidate").in("id", staleIds).select("id");
    if (retired.error) throw retired.error;
    retiredCount = list(retired.data).length;
  }
  return { contract: AVANTIQO_GENERAL_INTELLIGENCE_TRAINING_CANDIDATE_CONTRACT,
    status: desired.length ? "SEEDED" : "NO_ELIGIBLE_MASTERY_EVIDENCE", candidate_count: desired.length,
    written_count: writtenCount, unchanged_count: Math.max(0, desired.length - changed.length), retired_count: retiredCount,
    benchmark_required: true, unchanged_candidate_review_state_preserved: true,
    changed_evidence_requires_fresh_benchmark: true, automatic_training_started: false,
    automatic_model_weight_mutation: false, production_model_promotion_effect: "NONE" };
}
