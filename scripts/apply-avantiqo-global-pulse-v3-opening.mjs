import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { StoryboardRuntime } from "@/lib/creative/storyboard/runtime/StoryboardRuntime";
import { SceneRuntime } from "@/lib/creative/scenes/runtime/SceneRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { ResearchRuntime } from "@/lib/creative/research/runtime/ResearchRuntime";
import { InternalCreativeResearchRuntime } from "@/lib/creative/research/runtime/InternalCreativeResearchRuntime";
import { prepareInvestorFirstMinuteProduction } from "@/lib/creative/director/runtime/CreativeInvestorFirstMinuteProductionRuntime";
import { AVANTIQO_GLOBAL_PULSE_V3_OPENING_PLAN as master, AVANTIQO_GLOBAL_PULSE_V3_ORGANIZATION_ID as organization_id, AVANTIQO_GLOBAL_PULSE_V3_PROJECT_ID as creative_project_id, AVANTIQO_GLOBAL_PULSE_V3_MISSION_ID as creative_mission_id, AVANTIQO_GLOBAL_PULSE_V3_BRIEF_ID as brief_id, AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT } from "@/lib/creative/director/runtime/AvantiqoInvestorGlobalPulseV3OpeningPlan";

const supersession = `${AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT}:${master.story_lineage.master_plan_hash}`;
const project = await CreativeProjectRuntime.get(creative_project_id);
const brief = await CreativeBriefRuntime.get(brief_id);
if (!project || project.organization_id !== organization_id) throw new Error("GLOBAL_PULSE_V3_PROJECT_MISMATCH");
if (!brief || brief.creative_project_id !== creative_project_id) throw new Error("GLOBAL_PULSE_V3_BRIEF_MISMATCH");

const assetIds = project.metadata?.selected_asset_ids || [];
const { data: assets, error: assetError } = await supabaseAdmin.from("creative_assets").select("*").in("id", assetIds);
if (assetError) throw assetError;
const unverified = (assets || []).filter((asset) => asset.analysis?.semantic_status !== "VERIFIED" || Number(asset.analysis?.confidence || asset.analysis?.asset_confidence || 0) < 95);
if (unverified.length) throw new Error(`GLOBAL_PULSE_V3_REFERENCE_NOT_VERIFIED:${unverified.map((a)=>a.id).join(",")}`);

await CreativeProjectRuntime.update(creative_project_id, {
  objective: "One world. Millions of moving parts. Make investors feel civilization operating continuously before Avantiqo is introduced.",
  target_duration: 60,
  metadata: {
    ...(project.metadata || {}),
    workflow_kind: "TEMPORAL",
    research_policy: { mode: "INTERNAL_CREATIVE", external_research_required: false },
    canonical_opening_blueprint: AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT,
    canonical_opening_master_plan_hash: master.story_lineage.master_plan_hash,
    canonical_opening_story_contract_hash: master.story_lineage.story_contract_hash,
    canonical_opening_voice_direction: master.voice_direction,
    canonical_opening_sound_system: master.sound_system,
    canonical_opening_candidate_policy: master.candidate_policy,
    investor_first_minute: true,
    first_minute_scope: { start_seconds: 0, end_seconds: 60, duration_seconds: 60 },
    media_generation_authorized: true,
    media_generation_approval_source: "CHAT_USER_EXPLICIT_CURRENT_CONVERSATION_2026_09_08",
    publication_authorized: false,
    owned_only_required: true,
    external_provider_fallback_forbidden: true,
  },
});

await CreativeBriefRuntime.update(brief_id, {
  creative_objective: "One world. Millions of moving parts. Show the scale, beauty and complexity of the operating world before Avantiqo enters.",
  duration_seconds: 60,
  tone: "dark, contemplative, cinematic, physical, restrained, premium",
  emotion: "awe to acceleration to power to human vulnerability to ordinary importance to overload to silence",
  production: { quality: "WORLD_CLASS", draft_first: false, reuse_assets: false },
  metadata: { ...(brief.metadata || {}), canonical_opening_blueprint: AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT, voice_direction: master.voice_direction, sound_system: master.sound_system },
});

const existingReports = await ResearchRuntime.list({ organization_id, creative_project_id });
let groundingReport = existingReports.find((r) => r.metadata?.validation?.passed === true && r.metadata?.validation?.policy?.mode === "INTERNAL_CREATIVE" && r.metadata?.canonical_opening_blueprint === AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT);
if (!groundingReport) {
  const refreshedProject = await CreativeProjectRuntime.get(creative_project_id);
  const refreshedBrief = await CreativeBriefRuntime.get(brief_id);
  const reportData = InternalCreativeResearchRuntime.build({ organization_id, project: refreshedProject, brief: refreshedBrief, assets: assets || [] });
  reportData.metadata = { ...(reportData.metadata || {}), canonical_opening_blueprint: AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT, verified_reference_asset_ids: (assets || []).map((a)=>a.id), production_grounding_only: true, company_market_research_claimed_complete: false };
  groundingReport = await ResearchRuntime.create(reportData);
}

const oldTasks = await ProductionTaskRuntime.list({ organization_id, creative_project_id });
for (const task of oldTasks) {
  if (task.metadata?.canonical_opening_blueprint === AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT) continue;
  if (["RUNNING"].includes(task.status)) throw new Error(`GLOBAL_PULSE_V3_OLD_TASK_RUNNING:${task.id}`);
  await ProductionTaskRuntime.update(task.id, { status: "SKIPPED", metadata: { ...(task.metadata || {}), superseded_by_revision_task_id: supersession, superseded_reason: "CANONICAL_GLOBAL_PULSE_V3_OPENING_REPLACED_STALE_15_SHOT_PLAN", external_provider_fallback_forbidden: true } });
}
const oldShots = await ShotRuntime.list({ organization_id, creative_project_id });
for (const shot of oldShots) if (shot.metadata?.canonical_opening_blueprint !== AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT && !shot.archived_at) await ShotRuntime.archive(shot.id);
const oldScenes = await SceneRuntime.list({ organization_id, creative_project_id });
for (const scene of oldScenes) if (scene.metadata?.canonical_opening_blueprint !== AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT && !scene.archived_at) await SceneRuntime.archive(scene.id);
const oldStoryboards = await StoryboardRuntime.list({ organization_id, creative_project_id });
for (const sb of oldStoryboards) if (sb.metadata?.master_plan_hash !== master.story_lineage.master_plan_hash && sb.status !== "COMPLETED") await StoryboardRuntime.update(sb.id, { status: "COMPLETED", metadata: { ...(sb.metadata || {}), superseded_by_revision_task_id: supersession, superseded_reason: "CANONICAL_GLOBAL_PULSE_V3_OPENING_REPLACED_STALE_STORYBOARD" } });

let storyboard = (await StoryboardRuntime.list({ organization_id, creative_project_id })).find((sb) => sb.metadata?.master_plan_hash === master.story_lineage.master_plan_hash && sb.status !== "COMPLETED");
if (!storyboard) {
  storyboard = await StoryboardRuntime.create({ organization_id, creative_project_id, title: "One world. Millions of moving parts.", synopsis: "Civilization operating continuously at global scale; Avantiqo withheld until after 01:00.", total_duration: 60, status: "APPROVED", metadata: { canonical_opening_blueprint: AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT, master_plan_hash: master.story_lineage.master_plan_hash, story_lineage: master.story_lineage, master_plan_validation: { passed: true }, voice_direction: master.voice_direction, sound_system: master.sound_system } });
  storyboard = await StoryboardRuntime.update(storyboard.id, { creative_mission_id });
}

const prepared = await prepareInvestorFirstMinuteProduction({ organization_id, creative_project_id, creative_mission_id, master: { plan: master } });
console.log(JSON.stringify({ success: true, project_id: creative_project_id, grounding_report_id: groundingReport.id, verified_reference_count: assets?.length || 0, superseded_task_count: oldTasks.filter((t)=>t.metadata?.canonical_opening_blueprint !== AVANTIQO_GLOBAL_PULSE_V3_OPENING_CONTRACT).length, storyboard_id: storyboard.id, prepared: { production_graph_id: prepared.production_graph_id, execution_plan_id: prepared.execution_plan_id, scene_count: prepared.scene_ids.length, shot_count: prepared.shot_ids.length, task_count: prepared.task_ids.length, created_task_count: prepared.created_task_ids.length, full_master_hash: prepared.scoped.full_master_hash } }, null, 2));
