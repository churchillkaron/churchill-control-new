import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { evaluateProductionOffice } from "./CreativeProductionOfficeRuntime.js";
import { createCurrentRoomWorkOrders } from "./CreativeProductionWorkOrderRuntime.js";
import { executeSpecialistExecutionWave } from "./CreativeProductionSpecialistSchedulerRuntime.js";
import { mergeSpecialistWaveState } from "./CreativeProductionSpecialistWaveStateRuntime.js";
import { continuePreproductionWithoutSpend } from "./CreativePreproductionContinuationRuntime.js";
import {
  readPreproductionDurableState,
  persistPreproductionDurableState,
} from "./CreativePreproductionDurableStateRuntime.js";

export const CREATIVE_PREPRODUCTION_SPECIALIST_RUNTIME_CONTRACT =
  "CREATIVE_PREPRODUCTION_SPECIALIST_RUNTIME_V1";

export async function executePreproductionSpecialistWave({
  organization_id,
  creative_mission_id,
  creative_project_id,
  master_plan_digest,
  production_context = {},
  max_concurrency = 4,
  execution_runtime,
} = {}) {
  const project = await CreativeProjectRuntime.get(creative_project_id);
  if (!project || project.organization_id !== organization_id) throw new Error("Creative project not found");
  const context = { organization_id, creative_mission_id, creative_project_id };
  const durable = readPreproductionDurableState({ project, context, master_plan_digest });
  if (!durable) throw new Error("CREATIVE_PREPRODUCTION_DURABLE_STATE_REQUIRED");
  const office = evaluateProductionOffice({
    plan: durable.production_room_pipeline,
    reports_by_stage: durable.reports_by_stage,
  });
  const workOrders = createCurrentRoomWorkOrders({ office, reports_by_stage: durable.reports_by_stage });
  if (!workOrders.ready_count) throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_WORK_REQUIRED");
  const checkpointPlan =
    project.metadata?.creative_temporal_direction_checkpoint?.master?.plan ||
    project.metadata?.creative_tribunal_approved_checkpoint?.master?.plan ||
    project.metadata?.creative_post_repair_master_checkpoint?.master?.plan ||
    {};
  const researchInput = durable.production_room_stage_inputs?.RESEARCH_ROOM || {};
  const sealedResearchRoom = Array.isArray(durable.production_room_pipeline?.stages)
    ? durable.production_room_pipeline.stages.find((stage) => stage?.id === "RESEARCH_ROOM" && stage?.status === "SEALED")
    : null;
  const researchReport = researchInput.research_room_report || sealedResearchRoom?.report || {};
  const currentStage = office.current_room?.stage_id || null;
  const enrichedProductionContext = {
    ...production_context,
    current_stage: currentStage,
    approved_research: {
      source_manifest: researchReport.evidence?.source_manifest || [],
      open_questions: researchReport.evidence?.open_questions || [],
      summary: researchReport.evidence?.research_packet?.summary || researchReport.summary || null,
    },
    approved_story: checkpointPlan.story || {},
    approved_concept: checkpointPlan.concept || {},
    approved_scenes: Array.isArray(checkpointPlan.scenes)
      ? checkpointPlan.scenes.map((scene) => ({
          id: scene.id || null,
          location: scene.location || null,
          purpose: scene.purpose || null,
          shots: Array.isArray(scene.shots) ? scene.shots.map((shot) => ({
            id: shot.id || null,
            action: shot.action || null,
            purpose: shot.purpose || null,
            location: shot.location || shot.scene_location || null,
            production_design: shot.production_design || null,
            lighting: shot.lighting || null,
            material_behavior: shot.material_behavior || null,
            audio: shot.audio || null,
          })) : [],
        }))
      : [],
  };
  const wave = await executeSpecialistExecutionWave({
    organization_id,
    creative_project_id,
    work_orders: workOrders.work_orders,
    production_context: enrichedProductionContext,
    max_concurrency,
    execution_runtime,
  });
  const merged = mergeSpecialistWaveState({
    production_room_pipeline: durable.production_room_pipeline,
    reports_by_stage: durable.reports_by_stage,
    prior_audit: durable.specialist_wave_audit,
    wave_result: wave,
  });
  const continuation = continuePreproductionWithoutSpend({
    production_room_pipeline: merged.production_room_pipeline || durable.production_room_pipeline,
    production_room_stage_inputs: durable.production_room_stage_inputs || {},
    reports_by_stage: merged.reports_by_stage,
  });
  await persistPreproductionDurableState({
    context,
    master_plan_digest,
    state: {
      production_room_pipeline: continuation.production_room_pipeline || durable.production_room_pipeline,
      reports_by_stage: merged.reports_by_stage,
      production_room_stage_inputs: durable.production_room_stage_inputs || {},
      specialist_wave_audit: merged.specialist_wave_audit,
      preproduction_continuation: continuation,
    },
  });
  return Object.freeze({
    contract: CREATIVE_PREPRODUCTION_SPECIALIST_RUNTIME_CONTRACT,
    wave,
    merged,
    continuation,
    production_graph_required: false,
    media_generation_executed: false,
  });
}

export const CreativePreproductionSpecialistRuntime = Object.freeze({
  contract: CREATIVE_PREPRODUCTION_SPECIALIST_RUNTIME_CONTRACT,
  executeWave: executePreproductionSpecialistWave,
});
