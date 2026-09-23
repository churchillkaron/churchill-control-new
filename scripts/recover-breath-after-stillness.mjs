import { CreativeProjectRuntime } from "../lib/creative/projects/runtime/CreativeProjectRuntime.js";
import { UsageRuntime } from "../lib/platform/service-runtime/usage/UsageRuntime.js";

const PROJECT_ID = "e31d8e6f-b453-4570-b5d9-75c6c9aa05d0";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const MISSION_ID = "979e4d7f-ef8e-47d9-af3c-d0ccb3fa4f50";
const BASE_USAGE_ID = "90273602-ba35-4745-87a8-80c24f6048f7";
const PATCH_USAGE_ID = "51eb20b6-8d92-4bda-9a5f-59954ebc5fd9";
const RECOVERY_ID = "recovered-breath-after-stillness-r10";

function obj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function outputText(usage = {}) {
  const metadata = obj(usage.metadata);
  const transport = obj(metadata.provider_result || metadata.result);
  return String(transport?.output?.text || transport?.text || metadata?.result?.text || "");
}
function parseJson(text) {
  try { return JSON.parse(String(text || "").trim()); } catch { return null; }
}
const project = await CreativeProjectRuntime.get(PROJECT_ID);
if (!project || project.organization_id !== ORGANIZATION_ID) throw new Error("PROJECT_NOT_FOUND");

const [baseUsage, patchUsage] = await Promise.all([
  UsageRuntime.get(BASE_USAGE_ID),
  UsageRuntime.get(PATCH_USAGE_ID),
]);
const patchPayload = parseJson(outputText(patchUsage));
const patch = obj(patchPayload?.patch);
if (!Object.keys(patch).length) throw new Error("RECOVERY_PATCH_REQUIRED");

const currentMaster = obj(project.metadata?.creative_post_repair_master_checkpoint?.master);
const currentPlan = obj(currentMaster.plan);
if (!Object.keys(currentPlan).length) throw new Error("CURRENT_MASTER_REQUIRED");

const recoveredConcept = {
  id: RECOVERY_ID,
  director_role: "Mythic Emergence Director",
  title: "The Breath After Stillness",
  central_proposition: "Avantiqo emerges not as a force of action, but as the quiet, inevitable breath that follows the end of an ancient world’s silence—a natural cycle of stillness and revelation, where intelligence is not imposed, but slowly revealed through the rhythms of nature and human decision.",
  original_world: "A silent, ancient world where time has ceased to move, and all systems—biological, technological, and social—are suspended in stillness. No sound. No motion. No change. The world exists in a state of equilibrium, not of life, but of absence.",
  governing_world_rule: "In this world, nothing changes unless a decision is made by a human, and that decision is felt as a ripple through the natural systems—like a seed cracking in soil, or a river beginning to flow.",
  dramatic_question: "What happens when silence ends—not with noise, but with a single, unforced breath?",
  ...patch,
};
const recoveredStory = {
  hook: recoveredConcept.dramatic_question,
  causal_story: recoveredConcept.causal_story,
  payoff: recoveredConcept.payoff,
  emotional_arc: "Ancient stillness becomes attention, attention becomes human choice, and meaningful choices propagate through nature and infrastructure until Avantiqo is revealed as coherent intelligence already latent in the world.",
};

const recoveryCouncil = {
  contract: "CREATIVE_STORY_LINEAGE_RECOVERY_COUNCIL_V1",
  concepts: [recoveredConcept],
  concept_hash: null,
  council_hash: null,
  selection: {
    selected_concept_id: RECOVERY_ID,
    selected_concept: recoveredConcept,
    selection_reason: "User-authorized recovery of the durable Round 10 Breath After Stillness lineage after concept-ID crossover corrupted later rounds.",
    confidence: 100,
  },
  provenance: {
    base_usage_id: BASE_USAGE_ID,
    completion_repair_usage_id: PATCH_USAGE_ID,
    recovered_from_round: 10,
  },
};

const recoveredPlan = {
  ...currentPlan,
  concept: {
    ...obj(currentPlan.concept),
    id: RECOVERY_ID,
    title: recoveredConcept.title,
    hook: recoveredConcept.dramatic_question,
    message: recoveredConcept.central_proposition,
    narrative: recoveredConcept.causal_story,
    creative_thesis: recoveredConcept.central_proposition,
    selected_concept_id: RECOVERY_ID,
    visual_system: {
      ...obj(currentPlan.concept?.visual_system),
      world: recoveredConcept.original_world,
    },
    signature_images: recoveredConcept.signature_images || [],
  },
  story: recoveredStory,
  signature_images: recoveredConcept.signature_images || [],
  selected_concept_id: RECOVERY_ID,
  concept_candidates: [recoveredConcept],
  concept_council: recoveryCouncil,
  creative_tribunal: null,
  world_class_concept_intelligence: null,
  production_room_pipeline: null,
  production_room_bootstrap: null,
};

const recoveredMaster = {
  ...currentMaster,
  plan: recoveredPlan,
  independent_concept_council: recoveryCouncil,
  creative_tribunal: null,
  tribunal_resume_package: null,
  production_room_bootstrap: null,
};

await CreativeProjectRuntime.update(PROJECT_ID, {
  metadata: {
    ...project.metadata,
    creative_story_lineage_recovery: {
      contract: "CREATIVE_STORY_LINEAGE_RECOVERY_V1",
      organization_id: ORGANIZATION_ID,
      creative_mission_id: MISSION_ID,
      creative_project_id: PROJECT_ID,
      user_authorized: true,
      recovered_at: new Date().toISOString(),
      source_round: 10,
      source_usage_ids: [BASE_USAGE_ID, PATCH_USAGE_ID],
      corrupted_lineage_retained_for_audit: true,
      master: recoveredMaster,
    },
  },
});

console.log(JSON.stringify({
  recovered: true,
  concept_id: RECOVERY_ID,
  title: recoveredConcept.title,
  base_usage_id: BASE_USAGE_ID,
  patch_usage_id: PATCH_USAGE_ID,
  causal_story: recoveredStory.causal_story,
}, null, 2));
