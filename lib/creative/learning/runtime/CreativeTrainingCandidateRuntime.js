import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

export const CREATIVE_TRAINING_CANDIDATE_CONTRACT = "AVANTIQO_CREATIVE_TRAINING_CANDIDATE_V1";
const TRAINING_SCOPE = "platform_training_candidates";
const CANDIDATE_KIND = "CREATIVE_PREFERENCE_PAIR";

function text(value, limit = 800) { return String(value ?? "").trim().slice(0, limit); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function shotId(node = {}) { return text(node.metadata?.shot_id, 180) || null; }
function score(node = {}) {
  return {
    cinematic: finite(node.metadata?.selection_cinematic_merit_score ?? node.metadata?.shot_candidate_cinematic_merit_score),
    weakest: finite(node.metadata?.selection_weakest_score ?? node.metadata?.shot_candidate_weakest_score),
    overall: finite(node.metadata?.selection_overall_score ?? node.metadata?.shot_candidate_review_score),
  };
}
function failureFamily(node = {}) {
  return [...new Set([
    ...list(node.metadata?.shot_candidate_failed_checks),
    ...list(node.metadata?.shot_candidate_validation_failures),
  ].map((item) => text(item, 120)).filter(Boolean))].sort();
}
function structuralSignature(node = {}) {
  return {
    review_passed: node.metadata?.shot_candidate_review_passed === true,
    hard_human_quality_passed: node.metadata?.shot_candidate_hard_human_quality_passed !== false,
    scores: score(node),
    failure_family: failureFamily(node),
    repaired: Boolean(node.metadata?.repair_of_task_id || node.metadata?.repaired_source_task_id),
    agency_craft_contract: text(node.metadata?.directing_intelligence_contract, 180) || null,
  };
}
function preferencePairs(nodes = []) {
  const groups = new Map();
  for (const node of nodes) {
    if (node.type !== CREATIVE_ASSET_NODE_TYPES.VIDEO || !shotId(node)) continue;
    const id = shotId(node);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(node);
  }
  const pairs = [];
  for (const candidates of groups.values()) {
    const winner = candidates.find((node) => node.metadata?.selected_for_master === true);
    if (!winner) continue;
    for (const rejected of candidates.filter((node) => node.id !== winner.id && node.metadata?.rejected_by_candidate_competition === true)) {
      const preferred = structuralSignature(winner);
      const dispreferred = structuralSignature(rejected);
      const fingerprint = hash({ preferred, dispreferred });
      pairs.push({ preferred, dispreferred, fingerprint });
    }
  }
  return pairs;
}
function rowForPair(learningOrganization, pair) {
  const now = new Date().toISOString();
  const failureFamilyCombined = [...new Set(pair.dispreferred.failure_family)].sort();
  return {
    organization_id: learningOrganization,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: TRAINING_SCOPE,
    memory_key: `creative-preference:${pair.fingerprint.slice(0, 40)}`,
    memory_type: "lesson",
    subject: "creative.studio.preference",
    content: "De-identified Creative Studio preference pair: a world-class selected candidate is preferred over a reviewed rejected alternative. Use only the structural quality delta; never reproduce source creative.",
    importance: 0.92,
    confidence: 1,
    source: "creative_verified_preference_training_candidate",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: CREATIVE_TRAINING_CANDIDATE_CONTRACT,
      candidate_kind: CANDIDATE_KIND,
      capability_key: "creative.studio.preference",
      source_fingerprint: pair.fingerprint,
      source_reference_count: 2,
      failure_family: failureFamilyCombined,
      prior_failure_occurrence_count: failureFamilyCombined.length ? 1 : 0,
      outcome: "PREFER_WORLD_CLASS_WINNER",
      verification_mode: "WORLD_CLASS_CANDIDATE_COMPETITION",
      preferred: pair.preferred,
      dispreferred: pair.dispreferred,
      training_ready: false,
      benchmark_status: "UNREVIEWED",
      requires_benchmark_validation: true,
      benchmark_validated: false,
      customer_private_content_included: false,
      raw_payload_persisted: false,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
      identifiers_persisted: false,
      provider_prompts_persisted: false,
      authorization_value: "none",
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      imitation_of_prior_work_allowed: false,
      created_at: now,
    },
    updated_at: now,
  };
}

export async function captureCreativeTrainingCandidates({ organization_id, creative_project_id } = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  const learningOrganization = learningOrganizationId();
  if (!learningOrganization) return { contract: CREATIVE_TRAINING_CANDIDATE_CONTRACT, status: "DISABLED", written_count: 0 };
  const nodes = await AssetGraphRepository.listByProject({ organization_id, creative_project_id });
  const pairs = preferencePairs(nodes);
  if (!pairs.length) return { contract: CREATIVE_TRAINING_CANDIDATE_CONTRACT, status: "NO_VERIFIED_PREFERENCE_PAIRS", written_count: 0 };
  const rows = pairs.map((pair) => rowForPair(learningOrganization, pair));
  const written = await supabaseAdmin.from("intelligence_memories").upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" }).select("id,memory_key,subject,metadata");
  if (written.error) throw written.error;
  return {
    contract: CREATIVE_TRAINING_CANDIDATE_CONTRACT,
    status: "CAPTURED",
    candidate_count: pairs.length,
    written_count: list(written.data).length,
    training_started: false,
    production_model_promotion_effect: "NONE",
  };
}

export const CreativeTrainingCandidateRuntime = Object.freeze({
  contract: CREATIVE_TRAINING_CANDIDATE_CONTRACT,
  candidate_kind: CANDIDATE_KIND,
  capture: captureCreativeTrainingCandidates,
  preferencePairs,
  structuralSignature,
});
