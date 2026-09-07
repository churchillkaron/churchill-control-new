import crypto from "node:crypto";

import { SceneRuntime } from "@/lib/creative/scenes/runtime/SceneRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { StoryboardRuntime } from "@/lib/creative/storyboard/runtime/StoryboardRuntime";
import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { ExecutionRuntime } from "@/lib/creative/execution/runtime/ExecutionRuntime";
import { AssetReuseEngine } from "@/lib/creative/assets/reuse/AssetReuseEngine";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeProductionTaskMaterializationRuntime } from "@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime";

export const CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT =
  "AVANTIQO_INVESTOR_FIRST_MINUTE_PRODUCTION_V1";
export const INVESTOR_FIRST_MINUTE_START_SECONDS = 0;
export const INVESTOR_FIRST_MINUTE_END_SECONDS = 60;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function planFrom(master = {}) {
  return object(master.plan || master.temporal_direction?.plan || master);
}
function durationOf(value = {}, label = "SHOT") {
  const duration = finite(value.duration_seconds);
  if (duration === null || duration <= 0) throw new Error(`${label}_DURATION_REQUIRED`);
  return duration;
}
function promptlessGeneration(value = {}) {
  const generation = object(value);
  const {
    prompt: _prompt,
    provider_prompt: _providerPrompt,
    negative_prompt: _negativePrompt,
    visual_prompt: _visualPrompt,
    video_prompt: _videoPrompt,
    ...structured
  } = generation;
  return structured;
}
function assertAuthoritativeMaster(plan = {}) {
  if (text(plan.workflow_kind).toUpperCase() !== "TEMPORAL") {
    throw new Error("INVESTOR_FIRST_MINUTE_TEMPORAL_MASTER_REQUIRED");
  }
  if (plan.validation?.passed !== true) {
    throw new Error("INVESTOR_FIRST_MINUTE_VALIDATED_MASTER_REQUIRED");
  }
  if (plan.degraded === true) {
    throw new Error("INVESTOR_FIRST_MINUTE_DEGRADED_MASTER_BLOCKED");
  }
  if (!list(plan.scenes).length) {
    throw new Error("INVESTOR_FIRST_MINUTE_MASTER_SCENES_REQUIRED");
  }
  const total = list(plan.scenes).reduce((sum, scene, sceneIndex) => {
    const shots = list(scene.shots);
    if (!shots.length) throw new Error(`INVESTOR_FIRST_MINUTE_SCENE_SHOTS_REQUIRED:${sceneIndex + 1}`);
    return sum + shots.reduce((shotSum, shot, shotIndex) =>
      shotSum + durationOf(shot, `INVESTOR_FIRST_MINUTE_SHOT_${sceneIndex + 1}_${shotIndex + 1}`), 0);
  }, 0);
  if (total < INVESTOR_FIRST_MINUTE_END_SECONDS) {
    throw new Error(`INVESTOR_FIRST_MINUTE_MASTER_TOO_SHORT:${total}`);
  }
  const lineage = object(plan.story_lineage || plan.metadata?.story_lineage);
  if (!text(lineage.master_plan_hash) || !text(lineage.story_contract_hash)) {
    throw new Error("INVESTOR_FIRST_MINUTE_MASTER_LINEAGE_REQUIRED");
  }
  return total;
}

export function scopeInvestorFirstMinuteMaster(master = {}) {
  const fullPlan = planFrom(master);
  const fullDuration = assertAuthoritativeMaster(fullPlan);
  const fullMasterHash = digest(fullPlan);
  const scopedScenes = [];
  const shotWindows = [];
  let cursor = 0;
  let boundaryReached = false;

  for (const [sceneIndex, scene] of list(fullPlan.scenes).entries()) {
    const scopedShots = [];
    for (const [shotIndex, shot] of list(scene.shots).entries()) {
      const duration = durationOf(shot, `INVESTOR_FIRST_MINUTE_SHOT_${sceneIndex + 1}_${shotIndex + 1}`);
      const start = cursor;
      const end = cursor + duration;
      cursor = end;
      if (start >= INVESTOR_FIRST_MINUTE_END_SECONDS) continue;
      if (end > INVESTOR_FIRST_MINUTE_END_SECONDS + 0.001) {
        throw new Error(
          `INVESTOR_FIRST_MINUTE_SCOPE_NOT_SHOT_ALIGNED:${text(shot.id) || `${sceneIndex + 1}.${shotIndex + 1}`}:${start}:${end}`,
        );
      }
      scopedShots.push({
        ...shot,
        metadata: {
          ...object(shot.metadata),
          investor_first_minute_scope: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
          master_timeline_start_seconds: start,
          master_timeline_end_seconds: end,
          full_master_hash: fullMasterHash,
        },
      });
      shotWindows.push({
        scene_index: sceneIndex,
        shot_index: shotIndex,
        master_scene_id: scene.id || null,
        master_shot_id: shot.id || null,
        start_seconds: start,
        end_seconds: end,
      });
      if (Math.abs(end - INVESTOR_FIRST_MINUTE_END_SECONDS) <= 0.001) boundaryReached = true;
    }
    if (scopedShots.length) {
      scopedScenes.push({
        ...scene,
        duration_seconds: scopedShots.reduce((sum, shot) => sum + Number(shot.duration_seconds || 0), 0),
        shots: scopedShots,
        metadata: {
          ...object(scene.metadata),
          investor_first_minute_scope: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
          full_master_hash: fullMasterHash,
        },
      });
    }
  }

  if (!boundaryReached) throw new Error("INVESTOR_FIRST_MINUTE_EXACT_60_SECOND_BOUNDARY_REQUIRED");
  const scopedDuration = shotWindows.reduce((sum, window) => sum + (window.end_seconds - window.start_seconds), 0);
  if (Math.abs(scopedDuration - 60) > 0.001) {
    throw new Error(`INVESTOR_FIRST_MINUTE_DURATION_INVALID:${scopedDuration}`);
  }

  return {
    contract: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
    status: "SCOPED",
    scope: { start_seconds: 0, end_seconds: 60, duration_seconds: 60 },
    full_master_hash: fullMasterHash,
    full_master_duration_seconds: fullDuration,
    full_master_scene_count: list(fullPlan.scenes).length,
    full_master_shot_count: list(fullPlan.scenes).reduce((sum, scene) => sum + list(scene.shots).length, 0),
    scoped_scene_count: scopedScenes.length,
    scoped_shot_count: shotWindows.length,
    shot_windows: shotWindows,
    plan: {
      ...fullPlan,
      scenes: scopedScenes,
      production_scope: {
        contract: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
        immutable_full_master: true,
        full_master_hash: fullMasterHash,
        start_seconds: 0,
        end_seconds: 60,
        duration_seconds: 60,
        only_scoped_shots_may_materialize: true,
        full_master_replanning_forbidden: true,
        legacy_240_300_second_runtime_forbidden: true,
      },
    },
  };
}

async function resolveStoryboard({ organization_id, creative_project_id, creative_mission_id, scoped }) {
  const rows = await StoryboardRuntime.list({ organization_id, creative_project_id });
  const lineage = object(scoped.plan.story_lineage || scoped.plan.metadata?.story_lineage);
  const existing = rows.find((row) =>
    text(row.metadata?.master_plan_hash) === text(lineage.master_plan_hash) ||
    text(row.metadata?.story_lineage?.master_plan_hash) === text(lineage.master_plan_hash),
  );
  if (!existing) {
    throw new Error("INVESTOR_FIRST_MINUTE_AUTHORITATIVE_STORYBOARD_REQUIRED");
  }
  if (creative_mission_id && text(existing.creative_mission_id) !== text(creative_mission_id)) {
    throw new Error("INVESTOR_FIRST_MINUTE_STORYBOARD_MISSION_MISMATCH");
  }
  return existing;
}

async function materializeScopedRows({ organization_id, creative_project_id, storyboard, scoped }) {
  const existingScenes = await SceneRuntime.list({ organization_id, creative_project_id });
  const existingShots = await ShotRuntime.list({ organization_id, creative_project_id });
  const scenes = [];
  const shots = [];

  for (const [sceneIndex, scenePlan] of scoped.plan.scenes.entries()) {
    const masterSceneId = text(scenePlan.id || scenePlan.metadata?.master_plan_scene_id) || `scene-${sceneIndex + 1}`;
    let scene = existingScenes.find((row) =>
      text(row.metadata?.investor_first_minute_scope) === CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT &&
      text(row.metadata?.full_master_hash) === scoped.full_master_hash &&
      text(row.metadata?.master_plan_scene_id) === masterSceneId,
    );
    if (!scene) {
      scene = await SceneRuntime.create({
        organization_id,
        creative_project_id,
        storyboard_id: storyboard.id,
        scene_number: Number(scenePlan.scene_number || sceneIndex + 1),
        title: scenePlan.title || "",
        objective: scenePlan.objective || "",
        emotion: scenePlan.emotion || "",
        duration_seconds: durationOf(scenePlan, `INVESTOR_FIRST_MINUTE_SCENE_${sceneIndex + 1}`),
        location: scenePlan.location || {},
        actors: scenePlan.actors || [],
        products: scenePlan.products || [],
        brand_rules: scenePlan.brand_rules || [],
        visual_style: scenePlan.visual_style || {},
        camera_style: scenePlan.camera_style || {},
        audio_style: scenePlan.audio_style || {},
        metadata: {
          ...object(scenePlan.metadata),
          investor_first_minute_scope: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
          full_master_hash: scoped.full_master_hash,
          master_plan_scene_id: masterSceneId,
          scope_start_seconds: 0,
          scope_end_seconds: 60,
          immutable_full_master: true,
        },
      });
    }
    scenes.push(scene);

    for (const [shotIndex, shotPlan] of list(scenePlan.shots).entries()) {
      const masterShotId = text(shotPlan.id || shotPlan.metadata?.master_plan_shot_id) || `${masterSceneId}-shot-${shotIndex + 1}`;
      let shot = existingShots.find((row) =>
        text(row.metadata?.investor_first_minute_scope) === CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT &&
        text(row.metadata?.full_master_hash) === scoped.full_master_hash &&
        text(row.metadata?.master_plan_shot_id) === masterShotId,
      );
      if (!shot) {
        shot = await ShotRuntime.create({
          organization_id,
          creative_project_id,
          scene_id: scene.id,
          storyboard_id: storyboard.id,
          scene_number: scene.scene_number,
          shot_number: Number(shotPlan.shot_number || shotIndex + 1),
          title: shotPlan.title || "",
          purpose: shotPlan.purpose || "",
          subject: text(shotPlan.subject) || "Investor-film narrative subject",
          action: shotPlan.action || "",
          performance: shotPlan.performance || "",
          duration_seconds: durationOf(shotPlan, `INVESTOR_FIRST_MINUTE_SHOT_${sceneIndex + 1}_${shotIndex + 1}`),
          medium: shotPlan.medium || null,
          frame_plan: shotPlan.frame_plan || {},
          camera: shotPlan.camera || {},
          lighting: shotPlan.lighting || {},
          production_design: shotPlan.production_design || {},
          continuity: shotPlan.continuity || {},
          actors: shotPlan.actors || scene.actors || [],
          products: shotPlan.products || scene.products || [],
          location: shotPlan.location || scene.location || {},
          dialogue: shotPlan.dialogue || [],
          narration: shotPlan.narration || {},
          audio: shotPlan.audio || {},
          music: shotPlan.music || {},
          sound_effects: shotPlan.sound_effects || [],
          graphics: shotPlan.graphics || {},
          vfx: shotPlan.vfx || {},
          transition_in: shotPlan.transition_in || "",
          transition_out: shotPlan.transition_out || "",
          negative_constraints: shotPlan.negative_constraints || [],
          known_failure_modes: shotPlan.known_failure_modes || [],
          repair_instructions: shotPlan.repair_instructions || [],
          assets: shotPlan.assets || [],
          reference_assets: shotPlan.reference_assets || [],
          generation: promptlessGeneration(shotPlan.generation),
          service_id: shotPlan.generation?.service || shotPlan.service_id || null,
          service_code: shotPlan.generation?.service || shotPlan.service_code || null,
          capability: shotPlan.generation?.capability || shotPlan.capability || null,
          metadata: {
            ...object(shotPlan.metadata),
            investor_first_minute_scope: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
            full_master_hash: scoped.full_master_hash,
            master_plan_scene_id: masterSceneId,
            master_plan_shot_id: masterShotId,
            scope_start_seconds: 0,
            scope_end_seconds: 60,
            immutable_full_master: true,
            provider_prompts_persisted: false,
          },
        });
      }
      shots.push(shot);
    }
  }
  return { scenes, shots };
}

function taskInputForStep(step = {}) {
  return {
    intent: step.metadata?.intent || {},
    requirements: step.metadata?.requirements || {},
    source_assets: step.metadata?.source_assets || [],
    generation: promptlessGeneration(step.metadata?.generation || {}),
    frame_contract: step.metadata?.frame_contract || {},
    provider_parameters: step.metadata?.provider_parameters || {},
    repair_contract: step.metadata?.repair_contract || {},
  };
}

async function materializeTasks({ organization_id, creative_project_id, graph, executionPlan, scoped }) {
  const existing = await ProductionTaskRuntime.list({ organization_id, creative_project_id, production_graph_id: graph.id });
  const byNode = new Map(existing.filter((task) => task.metadata?.execution_node_id).map((task) => [task.metadata.execution_node_id, task]));
  const all = [];
  const created = [];

  for (const step of list(executionPlan.steps)) {
    let task = byNode.get(step.node_id);
    if (!task) {
      const node = list(graph.nodes).find((candidate) => text(candidate.id) === text(step.node_id));
      if (!node) throw new Error(`INVESTOR_FIRST_MINUTE_EXECUTION_NODE_NOT_FOUND:${step.node_id}`);
      const materialization = object(node.requirements?.task_materialization_contract);
      if (!CreativeProductionTaskMaterializationRuntime.verify(materialization)) {
        throw new Error(`INVESTOR_FIRST_MINUTE_TASK_CONTRACT_INVALID:${step.node_id}`);
      }
      task = await ProductionTaskRuntime.create({
        organization_id,
        creative_project_id,
        production_graph_id: graph.id,
        scene_id: node.metadata?.scene_id || null,
        shot_id: node.metadata?.shot_id || null,
        status: "WAITING",
        title: node.title || "",
        description: node.intent?.purpose || "",
        service_id: node.generation?.service || null,
        service_code: node.generation?.service || null,
        capability: node.generation?.capability || node.generation?.service || null,
        priority: Number(step.priority || 100),
        depends_on: [],
        input: taskInputForStep(step),
        cost: { estimated: Number(step.estimated_cost || 0), approved: Number(step.estimated_cost || 0) <= 0 },
        timing: { estimated_seconds: Number(step.estimated_seconds || 0) },
        metadata: {
          execution_node_id: step.node_id,
          execution_step_id: step.id,
          workflow_kind: "TEMPORAL",
          investor_first_minute_scope: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
          full_master_hash: scoped.full_master_hash,
          scope_start_seconds: 0,
          scope_end_seconds: 60,
          provider_prompts_persisted: false,
        },
      });
      created.push(task);
    }
    all.push(task);
  }

  return { created, all };
}

export async function prepareInvestorFirstMinuteProduction(input = {}) {
  const organization_id = text(input.organization_id);
  const creative_project_id = text(input.creative_project_id);
  const creative_mission_id = text(input.creative_mission_id);
  if (!organization_id) throw new Error("INVESTOR_FIRST_MINUTE_ORGANIZATION_REQUIRED");
  if (!creative_project_id) throw new Error("INVESTOR_FIRST_MINUTE_PROJECT_REQUIRED");
  if (!creative_mission_id) throw new Error("INVESTOR_FIRST_MINUTE_MISSION_REQUIRED");

  const scoped = scopeInvestorFirstMinuteMaster(input.master);
  const storyboard = await resolveStoryboard({ organization_id, creative_project_id, creative_mission_id, scoped });
  const rows = await materializeScopedRows({ organization_id, creative_project_id, storyboard, scoped });
  const graph = await ProductionGraphRuntime.plan({
    organization_id,
    creative_mission_id,
    creative_project_id,
    storyboard,
    scenes: rows.scenes,
    shots: rows.shots,
    creative_plan: scoped.plan,
  });
  const optimizedGraph = await AssetReuseEngine.optimizeGraph({ organization_id, creative_project_id, graph });
  const executionPlan = await ExecutionRuntime.plan({ organization_id, creative_project_id, production_graph: optimizedGraph });
  if (!list(executionPlan.steps).length) throw new Error("INVESTOR_FIRST_MINUTE_EXECUTION_STEPS_REQUIRED");
  const execution = await ExecutionRuntime.create(executionPlan);
  const tasks = await materializeTasks({ organization_id, creative_project_id, graph: optimizedGraph, executionPlan, scoped });

  return {
    contract: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
    status: "READY_FOR_GOVERNED_EXECUTION",
    generation_started: false,
    paid_execution_started: false,
    full_master_mutated: false,
    full_master_replanned: false,
    scoped,
    storyboard_id: storyboard.id,
    scene_ids: rows.scenes.map((scene) => scene.id),
    shot_ids: rows.shots.map((shot) => shot.id),
    production_graph_id: optimizedGraph.id,
    execution_plan_id: execution.id,
    task_ids: tasks.all.map((task) => task.id),
    created_task_ids: tasks.created.map((task) => task.id),
  };
}

export const CreativeInvestorFirstMinuteProductionRuntime = Object.freeze({
  contract: CREATIVE_INVESTOR_FIRST_MINUTE_PRODUCTION_CONTRACT,
  scope: scopeInvestorFirstMinuteMaster,
  prepare: prepareInvestorFirstMinuteProduction,
});
