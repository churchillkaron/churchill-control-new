import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { listOperatorCapabilities } from "@/lib/operator/runtime/OperatorCapabilityCatalog";
import { resolveAvantiqoLearningOrganization } from "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime";
import { weightedCapabilityOutcomeEvidence } from "@/lib/intelligence/runtime/AvantiqoCapabilityOutcomeEvidenceRuntime";

export const AVANTIQO_CAPABILITY_INTELLIGENCE_CURRICULUM_CONTRACT =
  "AVANTIQO_CAPABILITY_INTELLIGENCE_CURRICULUM_V1";

const MEMORY_TABLE = "intelligence_memories";
const COVERAGE_SCOPE = "platform_capability_intelligence_coverage";
const AGENDA_SCOPE = "platform_learning_agenda";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const OUTCOME_SCOPE = "platform_learning_outcomes";
const COMPETENCE_SCOPE = "platform_capability_competence_exams";
const AGENDA_SOURCE = "capability_intelligence_curriculum";

function text(value, limit = 6000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function hash(value) { return createHash("sha256").update(text(value, 30000)).digest("hex"); }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }
async function resolveLearningOrganizationId() {
  const configured = learningOrganizationId();
  if (configured) return configured;
  const resolved = await resolveAvantiqoLearningOrganization({ allowDatabaseFallback: true });
  return text(resolved?.organization_id, 160);
}

function catalogCompleteness(capability) {
  let score = 0;
  if (text(capability.description, 1200)) score += 0.2;
  if (list(capability.operator_examples).length || list(capability.operator_aliases).length) score += 0.15;
  if (capability.input_schema) score += 0.15;
  if (capability.output_schema) score += 0.15;
  if (text(capability.mode, 40)) score += 0.1;
  if (text(capability.risk, 40)) score += 0.1;
  if (capability.operator_verification) score += 0.15;
  return Number(Math.min(1, score).toFixed(4));
}

function exactCapability(row) {
  const metadata = object(row.metadata);
  return text(metadata.capability_key || metadata.binding_key || row.subject, 300);
}

function coverageFor(capability, knowledgeRows, outcomeRows, competenceRows) {
  const knowledgeCount = knowledgeRows.filter((row) => exactCapability(row) === capability.key).length;
  const outcomeEvidence = weightedCapabilityOutcomeEvidence(outcomeRows, capability.key);
  const catalogScore = catalogCompleteness(capability);
  const knowledgeScore = Math.min(1, knowledgeCount / 3);
  const outcomeScore = outcomeEvidence.score;
  const verificationScore = capability.operator_verification ? 1 : capability.mode === "read" ? 0.7 : 0;
  const competence = competenceRows.find((row) => exactCapability(row) === capability.key);
  const competenceScore = competence ? Math.max(0, Math.min(1, Number(object(competence.metadata).score || 0))) : 0;
  const score = catalogScore * 0.22 + knowledgeScore * 0.23 + outcomeScore * 0.2 + verificationScore * 0.15 + competenceScore * 0.2;
  const gaps = [];
  if (catalogScore < 0.8) gaps.push("CATALOG_SEMANTICS_INCOMPLETE");
  if (knowledgeCount < 2) gaps.push("EXACT_CAPABILITY_KNOWLEDGE_THIN");
  if (outcomeEvidence.weighted_evidence_units < 3) gaps.push("VERIFIED_OUTCOME_EXPERIENCE_THIN");
  if (!capability.operator_verification && capability.mode !== "read") gaps.push("VERIFICATION_CONTRACT_MISSING");
  if (!competence || competenceScore < 0.85) gaps.push("CAPABILITY_COMPETENCE_UNPROVEN");
  return { score:Number(score.toFixed(4)), catalog_score:catalogScore, knowledge_count:knowledgeCount, outcome_count:outcomeEvidence.counted_outcome_count, outcome_score:outcomeScore, outcome_weighted_evidence_units:outcomeEvidence.weighted_evidence_units, live_verified_outcome_count:outcomeEvidence.live_verified_count, historical_backfill_outcome_count:outcomeEvidence.historical_backfill_count, verified_failure_count:outcomeEvidence.verified_failure_count, verification_score:verificationScore, competence_score:Number(competenceScore.toFixed(4)), gaps };
}

function coverageRow(organizationId, capability, coverage, now) {
  return {
    organization_id:organizationId, party_id:null, entity_id:null, conversation_id:null, source_turn_id:null,
    memory_scope:COVERAGE_SCOPE, memory_key:`capability-intelligence:${hash(capability.key).slice(0,40)}`, memory_type:"fact",
    subject:capability.key, content:`Intelligence coverage for ${capability.key}: ${(coverage.score*100).toFixed(1)}%.`,
    importance:Math.max(0.55, 1-coverage.score*0.35), confidence:1, source:"capability_intelligence_coverage", active:true,
    valid_until:null, superseded_by:null, superseded_at:null, forgotten_at:null,
    metadata:{contract:AVANTIQO_CAPABILITY_INTELLIGENCE_CURRICULUM_CONTRACT,capability_key:capability.key,domain:capability.domain,
      capability:capability.capability,action:capability.action,mode:capability.mode,risk:capability.risk,requires_confirmation:capability.requires_confirmation===true,
      operator_verification_status:capability.operator_verification_status,catalog_score:coverage.catalog_score,exact_knowledge_count:coverage.knowledge_count,
      verified_outcome_count:coverage.outcome_count,verified_outcome_score:coverage.outcome_score,weighted_verified_outcome_units:coverage.outcome_weighted_evidence_units,live_verified_outcome_count:coverage.live_verified_outcome_count,historical_backfill_outcome_count:coverage.historical_backfill_outcome_count,verified_failure_count:coverage.verified_failure_count,verification_score:coverage.verification_score,competence_score:coverage.competence_score,intelligence_coverage_score:coverage.score,
      intelligence_gaps:coverage.gaps,coverage_is_not_authority:true,automatic_execution_authorized:false,automatic_training_started:false,
      customer_private_content_included:false,raw_reasoning_persisted:false,evaluated_at:now}, updated_at:now,
  };
}

function agendaRow(organizationId, capability, coverage, now) {
  return {
    organization_id:organizationId, party_id:null, entity_id:null, conversation_id:null, source_turn_id:null,
    memory_scope:AGENDA_SCOPE, memory_key:`agenda:${hash(`capability-intelligence:${capability.key}`)}`, memory_type:"goal", subject:`capability-intelligence-${capability.key}`,
    content:[
      `Build subject-matter intelligence for the exact Avantiqo capability ${capability.key}.`,
      `Capability description: ${text(capability.description, 1800) || capability.key}.`,
      `Mode ${capability.mode}; risk ${capability.risk}; current intelligence gaps: ${coverage.gaps.join(", ") || "none"}.`,
      "Research the external domain mechanisms, prerequisites, failure modes, edge cases, decision boundaries, terminology, evidence requirements and verification methods needed to use this capability intelligently.",
      "Use Avantiqo canonical product knowledge for claims about what the product itself can do; do not infer platform behavior from external sources.",
      "Prefer primary, authoritative, standards-based or peer-reviewed sources. Produce reusable reasoning knowledge, not customer-specific facts.",
    ].join(" "),
    importance:0.997, confidence:1, source:AGENDA_SOURCE, active:true, valid_until:null, superseded_by:null, superseded_at:null, forgotten_at:null,
    metadata:{contract:AVANTIQO_CAPABILITY_INTELLIGENCE_CURRICULUM_CONTRACT,continuous_learning:true,self_directed_learning:true,
      capability_intelligence_curriculum:true,education_scope:"CAPABILITY_INTELLIGENCE",topic_key:`capability-intelligence-${capability.key}`,
      capability_key:capability.key,knowledge_domain:capability.domain,jurisdiction:null,status:"READY",next_research_at:now,
      intelligence_coverage_score:coverage.score,intelligence_gaps:coverage.gaps,preferred_domains:[],source_diversity_required:true,
      trusted_source_policy:"PRIMARY_AUTHORITATIVE_OR_PEER_REVIEWED_PREFERRED",canonical_product_truth_must_come_from_internal_knowledge:true,
      automatic_knowledge_promotion:false,explicit_final_promotion_required:true,automatic_model_training:false,automatic_model_promotion:false,
      customer_private_content_allowed:false,authorization_value:"none",created_by:AGENDA_SOURCE}, updated_at:now,
  };
}

export async function reconcileAvantiqoCapabilityIntelligenceCurriculum({ organizationId = null } = {}) {
  const scopedOrganizationId = text(organizationId, 160) || await resolveLearningOrganizationId();
  if (!scopedOrganizationId) return { success:true,status:"DISABLED",reason:"LEARNING_ORGANIZATION_ID_REQUIRED",contract:AVANTIQO_CAPABILITY_INTELLIGENCE_CURRICULUM_CONTRACT };
  organizationId = scopedOrganizationId;
  const [capabilities, knowledge, outcomes, competence, existingAgendas] = await Promise.all([
    listOperatorCapabilities(),
    supabaseAdmin.from(MEMORY_TABLE).select("subject,metadata,active").eq("organization_id",organizationId).eq("memory_scope",KNOWLEDGE_SCOPE).eq("active",true).limit(5000),
    supabaseAdmin.from(MEMORY_TABLE).select("subject,metadata,active").eq("organization_id",organizationId).eq("memory_scope",OUTCOME_SCOPE).eq("active",true).limit(5000),
    supabaseAdmin.from(MEMORY_TABLE).select("subject,metadata,active,updated_at").eq("organization_id",organizationId).eq("memory_scope",COMPETENCE_SCOPE).eq("active",true).order("updated_at",{ascending:false}).limit(5000),
    supabaseAdmin.from(MEMORY_TABLE).select("id,memory_key,active,metadata").eq("organization_id",organizationId).eq("memory_scope",AGENDA_SCOPE).eq("source",AGENDA_SOURCE).limit(1000),
  ]);
  if (knowledge.error) throw knowledge.error;
  if (outcomes.error) throw outcomes.error;
  if (competence.error) throw competence.error;
  if (existingAgendas.error) throw existingAgendas.error;
  const now = new Date().toISOString();
  const latestCompetenceByCapability = new Map();
  for (const row of list(competence.data)) if (!latestCompetenceByCapability.has(exactCapability(row))) latestCompetenceByCapability.set(exactCapability(row), row);
  const competenceRows = [...latestCompetenceByCapability.values()];
  const assessments = list(capabilities).map((capability) => ({ capability, coverage:coverageFor(capability,list(knowledge.data),list(outcomes.data),competenceRows) }))
    .sort((a,b) => a.coverage.score-b.coverage.score || a.capability.key.localeCompare(b.capability.key));
  const coverageRows = assessments.map(({capability,coverage}) => coverageRow(organizationId,capability,coverage,now));
  if (coverageRows.length) {
    const written = await supabaseAdmin.from(MEMORY_TABLE).upsert(coverageRows,{onConflict:"organization_id,memory_scope,memory_key"}).select("id");
    if (written.error) throw written.error;
  }
  const selected = assessments[0] || null;
  const selectedKey = selected ? `agenda:${hash(`capability-intelligence:${selected.capability.key}`)}` : null;
  const retireIds = list(existingAgendas.data).filter((row) => row.active === true && row.memory_key !== selectedKey).map((row) => row.id).filter(Boolean);
  if (retireIds.length) {
    const retired = await supabaseAdmin.from(MEMORY_TABLE).update({active:false,superseded_at:now,updated_at:now}).eq("organization_id",organizationId).eq("memory_scope",AGENDA_SCOPE).eq("source",AGENDA_SOURCE).in("id",retireIds);
    if (retired.error) throw retired.error;
  }
  if (selected) {
    const agenda = agendaRow(organizationId,selected.capability,selected.coverage,now);
    const upserted = await supabaseAdmin.from(MEMORY_TABLE).upsert(agenda,{onConflict:"organization_id,memory_scope,memory_key"});
    if (upserted.error) throw upserted.error;
  }
  const byDomain = {};
  for (const item of assessments) {
    const domain = item.capability.domain || "unknown";
    const bucket = byDomain[domain] || { capability_count:0, coverage_total:0, low_coverage_count:0 };
    bucket.capability_count += 1; bucket.coverage_total += item.coverage.score; if (item.coverage.score < 0.7) bucket.low_coverage_count += 1; byDomain[domain]=bucket;
  }
  for (const bucket of Object.values(byDomain)) bucket.average_coverage = Number((bucket.coverage_total/Math.max(1,bucket.capability_count)).toFixed(4));
  return { success:true,status:"CAPABILITY_CURRICULUM_READY",contract:AVANTIQO_CAPABILITY_INTELLIGENCE_CURRICULUM_CONTRACT,
    capability_count:assessments.length,domain_count:Object.keys(byDomain).length,domain_coverage:byDomain,
    weakest_capability_key:selected?.capability?.key || null,weakest_capability_coverage:selected?.coverage?.score ?? null,
    nightly_capability_research_max_items:1,all_capabilities_assessed:true,capability_existence_does_not_equal_intelligence:true,
    automatic_execution_authorized:false,automatic_model_training:false,automatic_model_promotion:false };
}
