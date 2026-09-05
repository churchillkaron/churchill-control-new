import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
} from "@/lib/code/runtime/CodeAIEngineeringSkillLifecycleRuntime";

export const CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_V1";

const MEMORY_TABLE = "intelligence_memories";
const OBSERVATION_SCOPE = "code_ai_engineering_skill_lifecycle_observation";
const MAX_ROWS = 80;

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  return text(context.organizationId || context.organization_id, 160) || null;
}

function actorId(context = {}) {
  return text(context?.actor?.id || context?.actor?.user_id, 160) || null;
}

function safeObservation(metadata = {}) {
  const source = object(metadata);
  const assessment = object(source.assessment);
  return {
    skill_id: text(source.skill_id, 160) || null,
    skill_type: text(source.skill_type, 120) || null,
    current_base_commit: text(source.current_base_commit, 160) || null,
    observed_at: text(source.observed_at, 120) || null,
    current_head_revalidation_observed:
      assessment.current_head_revalidation_observed === true,
    current_head_revalidation_success:
      assessment.current_head_revalidation_success === true,
    direct_current_head_contradiction:
      assessment.direct_current_head_contradiction === true,
    architecture_drift_signal:
      assessment.architecture_drift_signal === true,
    repository_head_moved:
      assessment.repository_head_moved === true,
    repository_head_movement_without_contradiction:
      assessment.repository_head_movement_without_contradiction === true,
    verified_success_with_skill_revalidation:
      assessment.verified_success_with_skill_revalidation === true,
    verifier_checks: Number(assessment.verifier_checks || 0),
    verifier_passes: Number(assessment.verifier_passes || 0),
    successful_pre_mutation_area_reads:
      Number(assessment.successful_pre_mutation_area_reads || 0),
    failed_pre_mutation_area_reads:
      Number(assessment.failed_pre_mutation_area_reads || 0),
    sha_movement_alone_causes_decay: false,
  };
}

export async function loadCodeAIEngineeringSkillVisibleReceipt({
  context = {},
  missionId,
  repositoryUrl = null,
  ref = null,
} = {}) {
  const orgId = organizationId(context);
  const actor = actorId(context);
  const mission = text(missionId, 240);
  if (!orgId) throw new Error("CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_ORGANIZATION_REQUIRED");
  if (!actor) throw new Error("CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_ACTOR_REQUIRED");
  if (!mission) {
    return {
      contract: CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_CONTRACT,
      found: false,
      mission_id: null,
      observations: [],
      authorization_effect: "NONE",
    };
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata,created_at,updated_at")
    .eq("organization_id", orgId)
    .eq("memory_scope", OBSERVATION_SCOPE)
    .contains("metadata", {
      actor_id: actor,
      current_mission_id: mission,
    })
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (result.error) throw result.error;

  const expectedRepository = text(repositoryUrl, 1000).toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
  const expectedRef = text(ref, 160).toLowerCase();
  const seen = new Set();
  const observations = [];
  for (const row of result.data || []) {
    const metadata = object(row.metadata);
    if (text(metadata.contract, 180) !== CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT) continue;
    if (text(metadata.actor_id, 160) !== actor) continue;
    if (text(metadata.current_mission_id, 240) !== mission) continue;
    if (expectedRepository) {
      const repository = text(metadata.repository_url, 1000)
        .toLowerCase()
        .replace(/\/+$/, "")
        .replace(/\.git$/, "");
      if (repository !== expectedRepository) continue;
    }
    if (expectedRef && text(metadata.ref, 160).toLowerCase() !== expectedRef) continue;
    const skillId = text(metadata.skill_id, 160);
    if (!skillId || seen.has(skillId)) continue;
    seen.add(skillId);
    observations.push(safeObservation(metadata));
  }

  const revalidated = observations.filter(
    (entry) => entry.current_head_revalidation_success === true,
  ).length;
  const contradicted = observations.filter(
    (entry) => entry.direct_current_head_contradiction === true,
  ).length;
  const drift = observations.filter(
    (entry) => entry.architecture_drift_signal === true,
  ).length;
  const verifiedSuccesses = observations.filter(
    (entry) => entry.verified_success_with_skill_revalidation === true,
  ).length;
  const unchangedHeadMoves = observations.filter(
    (entry) => entry.repository_head_movement_without_contradiction === true,
  ).length;

  return {
    contract: CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_CONTRACT,
    lifecycle_contract: CODE_AI_ENGINEERING_SKILL_LIFECYCLE_CONTRACT,
    found: observations.length > 0,
    mission_id: mission,
    observations,
    observed_skill_count: observations.length,
    revalidated_skill_count: revalidated,
    contradicted_skill_count: contradicted,
    architecture_drift_signal_count: drift,
    verified_success_with_skill_revalidation_count: verifiedSuccesses,
    head_movement_without_contradiction_count: unchangedHeadMoves,
    learning_summary_status: observations.length
      ? contradicted > 0
        ? "CURRENT_HEAD_CONTRADICTION_RECORDED"
        : revalidated > 0
          ? "SKILLS_REVALIDATED_ON_CURRENT_HEAD"
          : "SKILL_USAGE_OBSERVED_NO_REVALIDATION_SIGNAL"
      : "NO_SKILL_LIFECYCLE_OBSERVATION",
    contains_raw_reasoning: false,
    contains_raw_source: false,
    contains_raw_patch: false,
    automatic_knowledge_promotion: false,
    reusable_platform_knowledge_written: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIEngineeringSkillVisibleReceiptRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_CONTRACT,
  load: loadCodeAIEngineeringSkillVisibleReceipt,
  contains_raw_reasoning: false,
  contains_raw_source: false,
  contains_raw_patch: false,
  automatic_knowledge_promotion: false,
  authorization_effect: "NONE",
});

export default CodeAIEngineeringSkillVisibleReceiptRuntime;
