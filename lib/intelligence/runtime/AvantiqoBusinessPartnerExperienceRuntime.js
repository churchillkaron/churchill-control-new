import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveAvantiqoLearningOrganization } from "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime";
import {
  observeVerifiedExecutionFailure,
  observeVerifiedExecutionSuccess,
} from "@/lib/operator/runtime/IntelligenceFailureLearningPolicy";

export const AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_V1";

const MEMORY_TABLE = "intelligence_memories";
const EXPERIENCE_SCOPE = "platform_business_partner_experience";
const RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function hash(value) {
  return createHash("sha256").update(text(value, 30000)).digest("hex");
}
function capabilityKey(execution = {}, decision = {}) {
  return text(
    execution?.capability?.key ||
      execution?.capability_key ||
      execution?.requested_capability_key ||
      decision?.capability_key ||
      decision?.selected_capability_key,
    300,
  ) || null;
}
function capabilityMode(execution = {}) {
  return text(execution?.capability?.mode || execution?.mode, 80).toLowerCase() || null;
}
function capabilityDomain(key) {
  const normalized = text(key, 300).toLowerCase().replace(/[:/]/g, ".");
  return normalized.split(".").filter(Boolean)[0] || null;
}
function executionStatus(execution = {}) {
  return text(execution?.status || execution?.state || execution?.result?.status, 120).toUpperCase() || null;
}
function verificationStatus(execution = {}) {
  return text(
    execution?.verification?.status ||
      execution?.post_action_verification?.status ||
      execution?.verification_status,
    120,
  ).toUpperCase() || null;
}
function evidenceSignal(evidence = {}) {
  const value = object(evidence);
  const items = list(value.items || value.observed_evidence || value.receipts);
  return {
    live_evidence_present: value.live_evidence_used === true || items.length > 0,
    evidence_item_count: Math.min(100, items.length),
  };
}

function structuralMissionChain(decision = {}) {
  const candidates = [
    decision?.plan_steps,
    decision?.governed_plan?.steps,
    decision?.cognitive_plan?.steps,
    decision?.plan,
  ].find(Array.isArray) || [];
  const steps = candidates.slice(0, 24).map((step, index) => ({
    id: text(step?.id || `step-${index + 1}`, 120),
    capability_key: text(step?.capability_key || step?.capability?.key, 300) || null,
    depends_on: list(step?.depends_on).map((value) => text(value, 120)).filter(Boolean).slice(0, 8),
  })).filter((step) => step.capability_key);
  const byId = new Map(steps.map((step) => [step.id, step.capability_key]));
  const edges = [];
  for (const step of steps) for (const dependency of step.depends_on) {
    const upstream = byId.get(dependency);
    if (upstream && upstream !== step.capability_key) edges.push([upstream, step.capability_key]);
  }
  return {
    capability_sequence: [...new Set(steps.map((step) => step.capability_key))].slice(0, 24),
    capability_dependency_edges: [...new Map(edges.map((edge) => [`${edge[0]}|${edge[1]}`, edge])).values()].slice(0, 32),
  };
}

function outcomeSignal(execution = {}) {
  const success = observeVerifiedExecutionSuccess(execution);
  if (success) {
    return {
      verified_outcome: "VERIFIED_SUCCESS",
      verification_mode: text(success.verification_mode, 120) || null,
      failure_class: null,
      affects_capability_reliability: false,
    };
  }
  const failure = observeVerifiedExecutionFailure(execution);
  return {
    verified_outcome: failure?.affects_capability_reliability === true ? "VERIFIED_FAILURE" : null,
    verification_mode: failure?.post_action_verification_failed ? "post_action_verification" : null,
    failure_class: text(failure?.failure_class, 80) || null,
    affects_capability_reliability: failure?.affects_capability_reliability === true,
  };
}

export function deriveAvantiqoBusinessPartnerExperience({ decision = {}, evidence = {}, execution = {} } = {}) {
  const key = capabilityKey(execution, decision);
  const evidenceState = evidenceSignal(evidence);
  const outcome = outcomeSignal(execution);
  const mission = structuralMissionChain(decision);
  const hasStructuralSignal = Boolean(
    key || executionStatus(execution) || outcome.failure_class || evidenceState.live_evidence_present,
  );
  if (!hasStructuralSignal) return null;
  return {
    contract: AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT,
    capability_key: key,
    capability_domain: capabilityDomain(key),
    capability_mode: capabilityMode(execution),
    execution_status: executionStatus(execution),
    verification_status: verificationStatus(execution),
    verified_outcome: outcome.verified_outcome,
    verification_mode: outcome.verification_mode,
    failure_class: outcome.failure_class,
    affects_capability_reliability: outcome.affects_capability_reliability,
    live_evidence_present: evidenceState.live_evidence_present,
    evidence_item_count: evidenceState.evidence_item_count,
    decision_kind: text(decision?.intent || decision?.kind || decision?.action, 120) || null,
    capability_sequence: mission.capability_sequence,
    capability_dependency_edges: mission.capability_dependency_edges,
    structural_only: true,
    authority_effect: "NONE",
  };
}

async function resolveLearningOrganizationId() {
  const configured = text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
  if (configured) return configured;
  const resolved = await resolveAvantiqoLearningOrganization({ allowDatabaseFallback: true });
  return text(resolved?.organization_id, 160);
}

export async function recordAvantiqoBusinessPartnerExperience({
  sourceTurnId = null,
  decision = {},
  evidence = {},
  execution = {},
} = {}) {
  const turnId = text(sourceTurnId, 160);
  if (!turnId) return { written: false, reason: "SOURCE_TURN_REQUIRED", contract: AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT };
  const experience = deriveAvantiqoBusinessPartnerExperience({ decision, evidence, execution });
  if (!experience) return { written: false, reason: "NO_STRUCTURAL_EXPERIENCE_SIGNAL", contract: AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT };
  const organizationId = await resolveLearningOrganizationId();
  if (!organizationId) return { written: false, reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED", contract: AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT };
  const now = new Date();
  const nowIso = now.toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EXPERIENCE_SCOPE,
    memory_key: `experience-turn:${hash(turnId).slice(0, 40)}`,
    memory_type: experience.verified_outcome === "VERIFIED_FAILURE" ? "blocker" : "fact",
    subject: experience.capability_key || "business-partner-turn",
    content: experience.capability_key
      ? `Structural Business Partner experience observed for ${experience.capability_key}.`
      : "Structural Business Partner experience observed.",
    importance: experience.verified_outcome === "VERIFIED_FAILURE" ? 0.88 : 0.64,
    confidence: 1,
    source: "business_partner_experience_engine",
    active: true,
    valid_until: new Date(now.getTime() + RETENTION_DAYS * DAY_MS).toISOString(),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      ...experience,
      observed_at: nowIso,
      source_turn_fingerprint: hash(turnId),
      source_turn_id_persisted: false,
      source_organization_id_persisted: false,
      source_party_id_persisted: false,
      source_conversation_id_persisted: false,
      customer_private_content_included: false,
      customer_identifiers_included: false,
      raw_decision_persisted: false,
      raw_evidence_persisted: false,
      raw_payload_persisted: false,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
      training_ready: false,
      automatic_training_effect: "NONE",
      automatic_model_promotion: false,
    },
    updated_at: nowIso,
  };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key", ignoreDuplicates: true })
    .select("id,subject,metadata")
    .maybeSingle();
  if (written.error) throw written.error;
  return {
    written: Boolean(written.data?.id),
    contract: AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT,
    capability_key: experience.capability_key,
    verified_outcome: experience.verified_outcome,
    failure_class: experience.failure_class,
    structural_only: true,
    authority_effect: "NONE",
  };
}


export async function summarizeAvantiqoBusinessPartnerExperience({ organizationId = null, limit = 5000 } = {}) {
  const scopedOrganizationId = text(organizationId, 160) || await resolveLearningOrganizationId();
  if (!scopedOrganizationId) return { available:false, reason:"LEARNING_ORGANIZATION_NOT_CONFIGURED", contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT, summaries:[] };
  const rowLimit = Math.max(1, Math.min(20000, Number(limit) || 5000));
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("subject,metadata,created_at")
    .eq("organization_id", scopedOrganizationId)
    .eq("memory_scope", EXPERIENCE_SCOPE)
    .eq("active", true)
    .order("created_at", { ascending:false })
    .limit(rowLimit);
  if (result.error) throw result.error;
  const byCapability = new Map();
  for (const row of list(result.data)) {
    const metadata = object(row.metadata);
    if (metadata.structural_only !== true || metadata.customer_private_content_included === true || metadata.raw_reasoning_persisted === true) continue;
    const key = text(metadata.capability_key || row.subject, 300);
    if (!key || key === "business-partner-turn") continue;
    const bucket = byCapability.get(key) || { capability_key:key, capability_domain:text(metadata.capability_domain,120)||null, turn_count:0, live_evidence_turn_count:0, verified_success_count:0, verified_failure_count:0, prerequisite_failure_count:0, model_reasoning_failure_count:0, transport_runtime_failure_count:0, last_observed_at:null };
    bucket.turn_count += 1;
    if (metadata.live_evidence_present === true) bucket.live_evidence_turn_count += 1;
    if (metadata.verified_outcome === "VERIFIED_SUCCESS") bucket.verified_success_count += 1;
    if (metadata.verified_outcome === "VERIFIED_FAILURE") bucket.verified_failure_count += 1;
    if (metadata.failure_class === "PREREQUISITE_FAILURE") bucket.prerequisite_failure_count += 1;
    if (metadata.failure_class === "MODEL_REASONING_FAILURE") bucket.model_reasoning_failure_count += 1;
    if (metadata.failure_class === "TRANSPORT_RUNTIME_FAILURE") bucket.transport_runtime_failure_count += 1;
    if (!bucket.last_observed_at) bucket.last_observed_at = metadata.observed_at || row.created_at || null;
    byCapability.set(key, bucket);
  }
  const summaries = [...byCapability.values()].map((item) => ({
    ...item,
    verified_outcome_count:item.verified_success_count+item.verified_failure_count,
    experience_strength:Number(Math.min(1, Math.log1p(item.turn_count)/Math.log(21)).toFixed(4)),
    live_evidence_rate:Number((item.live_evidence_turn_count/Math.max(1,item.turn_count)).toFixed(4)),
    authority_effect:"NONE",
  })).sort((a,b) => b.turn_count-a.turn_count || b.verified_failure_count-a.verified_failure_count || a.capability_key.localeCompare(b.capability_key));
  return { available:true, contract:AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT, observed_row_count:list(result.data).length, capability_count:summaries.length, summaries, authority_effect:"NONE", automatic_training_started:false };
}

export const AvantiqoBusinessPartnerExperienceRuntime = Object.freeze({
  contract: AVANTIQO_BUSINESS_PARTNER_EXPERIENCE_CONTRACT,
  derive: deriveAvantiqoBusinessPartnerExperience,
  record: recordAvantiqoBusinessPartnerExperience,
  summarize: summarizeAvantiqoBusinessPartnerExperience,
});
