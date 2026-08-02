import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const CONTRACT =
  "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V2";
const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-semantic-replan-convergence.v2",
);
const TASK_LIST_FLAG = Symbol.for(
  "avantiqo.creative.temporal-semantic-replan-task-filter.v2",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function scalar(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function repairedPlan(result = {}) {
  const plan = object(result.plan);
  return plan.validation?.temporal_semantic_repair?.applied === true
    ? plan
    : null;
}

async function rows(table, {
  organization_id,
  creative_project_id,
  order = "created_at",
} = {}) {
  let query = supabaseAdmin
    .from(table)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("creative_project_id", creative_project_id);

  if (order) query = query.order(order, { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function updateRow(table, id, values) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

function totalDuration(plan = {}) {
  return list(plan.scenes).reduce(
    (sum, scene) => sum + Number(scene.duration_seconds || 0),
    0,
  );
}

function referenceAssets(shotPlan = {}, current = {}) {
  const canonical = list(shotPlan.reference_assets);
  if (canonical.length) return canonical;

  const ids = list(shotPlan.reference_asset_ids);
  if (ids.length) {
    return ids.map((assetId) => ({
      asset_id: assetId,
      role: "REFERENCE",
    }));
  }

  return list(current.reference_assets);
}

function framePlan(shotPlan = {}, current = {}) {
  const canonical = object(shotPlan.frame_plan);
  if (Object.keys(canonical).length) return canonical;

  return {
    ...object(current.frame_plan),
    opening_frame:
      shotPlan.opening_frame ??
      current.frame_plan?.opening_frame ??
      null,
    progression:
      shotPlan.progression ??
      shotPlan.progression_frames ??
      current.frame_plan?.progression ??
      null,
    closing_frame:
      shotPlan.closing_frame ??
      current.frame_plan?.closing_frame ??
      null,
  };
}

function audioPlan(shotPlan = {}, current = {}) {
  const canonical = object(shotPlan.audio);
  if (Object.keys(canonical).length) return canonical;

  const legacy = object(shotPlan.sound_design);
  return {
    ...object(current.audio),
    source_sound:
      legacy.source_sound ||
      legacy.ambience ||
      current.audio?.source_sound ||
      null,
    sound_effects:
      list(shotPlan.sound_effects || legacy.sound_effects).length
        ? list(shotPlan.sound_effects || legacy.sound_effects)
        : list(current.audio?.sound_effects),
    music:
      Object.keys(object(shotPlan.music || legacy.music)).length
        ? object(shotPlan.music || legacy.music)
        : object(current.audio?.music),
    silence:
      legacy.silence ??
      current.audio?.silence ??
      null,
    mix_intent:
      legacy.mix_intent ||
      legacy.mix ||
      current.audio?.mix_intent ||
      null,
  };
}

function repairInstructions(shotPlan = {}, generation = {}, current = {}) {
  const direct = list(shotPlan.repair_instructions);
  if (direct.length) return direct;

  const generated = list(generation.repair_instructions);
  if (generated.length) return generated;

  const repair = object(
    shotPlan.repair_contract || generation.repair_contract,
  );
  const instructions = list(
    repair.instructions || repair.repairs || repair.actions,
  );
  return instructions.length
    ? instructions
    : list(current.repair_instructions);
}

async function convergeStrategy({
  organization_id,
  creative_project_id,
  plan,
  validation,
}) {
  const strategies = await rows("creative_strategies", {
    organization_id,
    creative_project_id,
  });
  const strategy = strategies.find((item) => !item.archived_at) || null;
  if (!strategy) return null;

  return updateRow("creative_strategies", strategy.id, {
    title: plan.concept?.title || strategy.title,
    creative_angle: plan.concept?.hook || strategy.creative_angle,
    core_message: plan.concept?.message || strategy.core_message,
    story_direction:
      plan.concept?.narrative || strategy.story_direction,
    visual_direction: {
      ...object(strategy.visual_direction),
      visual_system: plan.concept?.visual_system || {},
      camera_language: plan.concept?.camera_language || {},
      lighting_system: plan.concept?.lighting_system || {},
      production_design: plan.concept?.production_design || {},
      typography_system: plan.concept?.typography_system || {},
    },
    production_direction: {
      ...object(strategy.production_direction),
      target_duration: totalDuration(plan),
      deliverables: plan.deliverables || [],
      production: plan.production || {},
      quality: plan.quality || {},
    },
    metadata: {
      ...object(strategy.metadata),
      master_plan_validation: validation,
      temporal_semantic_replan_converged: true,
      temporal_semantic_replan_contract: CONTRACT,
    },
  });
}

async function convergeConcept({
  organization_id,
  creative_project_id,
  plan,
  validation,
}) {
  const concepts = await rows("creative_concepts", {
    organization_id,
    creative_project_id,
  });
  const concept = concepts.find((item) => !item.archived_at) || null;
  if (!concept) return null;

  const planned = object(plan.concept);
  const semanticId = text(planned.id || plan.selected_concept_id);
  const visualStyle =
    planned.visual_style ?? planned.visual_system ?? concept.visual_style;
  const cameraStyle =
    planned.camera_style ?? planned.camera_language ?? concept.camera_style;

  return updateRow("creative_concepts", concept.id, {
    title: planned.title || concept.title,
    hook: planned.hook || concept.hook,
    message: planned.message || concept.message,
    emotion: planned.emotion || concept.emotion,
    visual_style: scalar(visualStyle, concept.visual_style || ""),
    narrative: planned.narrative || concept.narrative,
    camera_style: scalar(cameraStyle, concept.camera_style || ""),
    music_style:
      scalar(
        planned.music_style || planned.music_language,
        concept.music_style || "",
      ),
    voice_style:
      scalar(
        planned.voice_style || planned.voice_language,
        concept.voice_style || "",
      ),
    call_to_action:
      planned.call_to_action || concept.call_to_action || "",
    target_audience:
      object(planned.target_audience || concept.target_audience),
    metadata: {
      ...object(concept.metadata),
      ...(semanticId ? { semantic_concept_id: semanticId } : {}),
      master_plan_quality: plan.quality || {},
      master_plan_validation: validation,
      creative_direction: {
        visual_system: planned.visual_system || {},
        camera_language: planned.camera_language || {},
        lighting_system: planned.lighting_system || {},
        production_design: planned.production_design || {},
        typography_system: planned.typography_system || {},
      },
      temporal_semantic_replan_converged: true,
      temporal_semantic_replan_contract: CONTRACT,
    },
  });
}

async function convergeStoryboard({
  organization_id,
  creative_project_id,
  plan,
  validation,
}) {
  const storyboards = await rows("creative_storyboards", {
    organization_id,
    creative_project_id,
  });
  const storyboard = storyboards.find((item) => !item.archived_at) || null;
  if (!storyboard) return null;

  return updateRow("creative_storyboards", storyboard.id, {
    title: plan.concept?.title || storyboard.title,
    synopsis:
      plan.concept?.narrative ||
      plan.concept?.message ||
      storyboard.synopsis,
    total_duration: totalDuration(plan),
    metadata: {
      ...object(storyboard.metadata),
      master_plan_quality: plan.quality || {},
      master_plan_validation: validation,
      story_architecture: plan.story_architecture || {},
      temporal_semantic_replan_converged: true,
      temporal_semantic_replan_contract: CONTRACT,
    },
  });
}

async function convergeScenesAndShots({
  organization_id,
  creative_project_id,
  plan,
}) {
  const scenes = (await rows("creative_scenes", {
    organization_id,
    creative_project_id,
    order: "scene_number",
  })).filter((item) => !item.archived_at);
  const shots = (await rows("creative_shots", {
    organization_id,
    creative_project_id,
    order: "scene_number",
  })).filter((item) => !item.archived_at);
  const planScenes = list(plan.scenes);

  if (scenes.length !== planScenes.length) {
    throw new Error(
      `TEMPORAL_SEMANTIC_REPLAN_SCENE_COUNT_MISMATCH:` +
      `${scenes.length}:${planScenes.length}`,
    );
  }

  for (const [sceneIndex, scene] of scenes.entries()) {
    const scenePlan = planScenes[sceneIndex];
    const sceneShots = shots
      .filter((shot) => String(shot.scene_id) === String(scene.id))
      .sort((left, right) =>
        Number(left.shot_number || 0) - Number(right.shot_number || 0),
      );
    const planShots = list(scenePlan.shots);

    if (sceneShots.length !== planShots.length) {
      throw new Error(
        `TEMPORAL_SEMANTIC_REPLAN_SHOT_COUNT_MISMATCH:` +
        `${sceneIndex + 1}:${sceneShots.length}:${planShots.length}`,
      );
    }

    await updateRow("creative_scenes", scene.id, {
      title: scenePlan.title || scene.title,
      objective: scenePlan.objective || scene.objective,
      emotion: scenePlan.emotion || scene.emotion,
      duration_seconds: Number(
        scenePlan.duration_seconds ?? scene.duration_seconds,
      ),
      location: scenePlan.location || scene.location || {},
      actors: list(scenePlan.actors).length
        ? list(scenePlan.actors)
        : list(scene.actors),
      products: list(scenePlan.products).length
        ? list(scenePlan.products)
        : list(scene.products),
      brand_rules: list(scenePlan.brand_rules).length
        ? list(scenePlan.brand_rules)
        : list(scene.brand_rules),
      visual_style:
        scenePlan.visual_style || scene.visual_style || {},
      camera_style:
        scenePlan.camera_style || scene.camera_style || {},
      audio_style:
        scenePlan.audio_style || scene.audio_style || {},
      metadata: {
        ...object(scene.metadata),
        master_plan_index: sceneIndex,
        story_function: scenePlan.story_function || null,
        story_state_before: scenePlan.story_state_before || null,
        state_change: scenePlan.state_change || null,
        story_state_after: scenePlan.story_state_after || null,
        transition_logic: scenePlan.transition_logic || null,
        temporal_semantic_replan_converged: true,
        temporal_semantic_replan_contract: CONTRACT,
      },
    });

    for (const [shotIndex, shot] of sceneShots.entries()) {
      const shotPlan = planShots[shotIndex];
      const generation = {
        ...object(shot.generation),
        ...object(shotPlan.generation),
      };
      if (shotPlan.provider_prompt && !generation.provider_prompt) {
        generation.provider_prompt = shotPlan.provider_prompt;
      }
      if (
        Object.keys(object(shotPlan.provider_parameters)).length &&
        !Object.keys(object(generation.provider_parameters)).length
      ) {
        generation.provider_parameters = shotPlan.provider_parameters;
      }
      if (
        Object.keys(object(shotPlan.output_spec)).length &&
        !Object.keys(object(generation.output_spec)).length
      ) {
        generation.output_spec = shotPlan.output_spec;
      }

      await updateRow("creative_shots", shot.id, {
        title: shotPlan.title || shot.title,
        purpose: shotPlan.purpose || shot.purpose,
        subject: shotPlan.subject || shot.subject,
        action: shotPlan.action || shot.action,
        performance: shotPlan.performance || shot.performance,
        duration_seconds: Number(
          shotPlan.duration_seconds ?? shot.duration_seconds,
        ),
        medium: shotPlan.medium ?? shot.medium,
        frame_plan: framePlan(shotPlan, shot),
        camera: shotPlan.camera || shot.camera || {},
        lighting: shotPlan.lighting || shot.lighting || {},
        production_design:
          shotPlan.production_design || shot.production_design || {},
        continuity: shotPlan.continuity || shot.continuity || {},
        actors: list(shotPlan.actors).length
          ? list(shotPlan.actors)
          : list(shot.actors),
        products: list(shotPlan.products).length
          ? list(shotPlan.products)
          : list(shot.products),
        location:
          shotPlan.location || scenePlan.location || shot.location || {},
        dialogue: list(shotPlan.dialogue).length
          ? list(shotPlan.dialogue)
          : list(shot.dialogue),
        narration: shotPlan.narration || shot.narration || {},
        audio: audioPlan(shotPlan, shot),
        music: shotPlan.music || shot.music || {},
        sound_effects: list(shotPlan.sound_effects).length
          ? list(shotPlan.sound_effects)
          : list(shot.sound_effects),
        subtitles: list(shotPlan.subtitles).length
          ? list(shotPlan.subtitles)
          : list(shot.subtitles),
        graphics: shotPlan.graphics || shot.graphics || {},
        vfx: object(shotPlan.vfx || shot.vfx),
        transition_in: scalar(
          shotPlan.transition_in,
          shot.transition_in || "",
        ),
        transition_out: scalar(
          shotPlan.transition_out,
          shot.transition_out || "",
        ),
        reference_assets: referenceAssets(shotPlan, shot),
        negative_constraints: list(shotPlan.negative_constraints).length
          ? list(shotPlan.negative_constraints)
          : list(shot.negative_constraints),
        known_failure_modes: list(shotPlan.known_failure_modes).length
          ? list(shotPlan.known_failure_modes)
          : list(shot.known_failure_modes),
        repair_instructions: repairInstructions(
          shotPlan,
          generation,
          shot,
        ),
        assets: list(shotPlan.assets).length
          ? list(shotPlan.assets)
          : list(shot.assets),
        generation,
        ai_generation: {
          ...object(shot.ai_generation),
          ...object(shotPlan.ai_generation),
        },
        service_id:
          shotPlan.service_id ||
          shotPlan.service_code ||
          generation.service ||
          shot.service_id ||
          null,
        service_code:
          shotPlan.service_code ||
          shotPlan.service_id ||
          generation.service ||
          shot.service_code ||
          null,
        capability:
          shotPlan.capability ||
          generation.capability ||
          shot.capability ||
          null,
        metadata: {
          ...object(shot.metadata),
          master_plan_scene_index: sceneIndex,
          master_plan_shot_index: shotIndex,
          identity_requirements:
            shotPlan.identity_requirements ||
            shot.metadata?.identity_requirements ||
            {},
          product_requirements:
            shotPlan.product_requirements ||
            shot.metadata?.product_requirements ||
            {},
          rights_requirements:
            shotPlan.rights_requirements ||
            shot.metadata?.rights_requirements ||
            {},
          typography:
            shotPlan.typography || shot.metadata?.typography || {},
          reuse_policy:
            shotPlan.reuse_policy || shot.metadata?.reuse_policy || {},
          temporal_semantic_replan_converged: true,
          temporal_semantic_replan_contract: CONTRACT,
        },
      });
    }
  }
}

async function supersedeDerivedWork({
  organization_id,
  creative_project_id,
}) {
  const supersededAt = new Date().toISOString();
  const tasks = await rows("creative_production_tasks", {
    organization_id,
    creative_project_id,
    order: "created_at",
  });

  for (const task of tasks) {
    const status = text(task.status).toUpperCase();
    if (["RUNNING", "COMPLETED"].includes(status)) {
      throw new Error(
        `TEMPORAL_SEMANTIC_REPLAN_EXECUTED_TASK_BLOCKED:` +
        `${task.id}:${task.status}`,
      );
    }
    await updateRow("creative_production_tasks", task.id, {
      status: "SKIPPED",
      metadata: {
        ...object(task.metadata),
        superseded_for_replan: true,
        superseded_at: supersededAt,
        superseded_reason:
          "TEMPORAL_SEMANTIC_PLAN_VALIDATION_FAILED_BEFORE_EXECUTION",
        provider_execution_performed: false,
        wallet_reservation_performed: false,
      },
      error: "SUPERSEDED_BY_TEMPORAL_SEMANTIC_REPLAN",
    });
  }

  const graphs = await rows("creative_production_graphs", {
    organization_id,
    creative_project_id,
    order: "created_at",
  });
  for (const graph of graphs) {
    if (text(graph.status).toUpperCase() === "APPROVED") {
      throw new Error(
        `TEMPORAL_SEMANTIC_REPLAN_APPROVED_GRAPH_BLOCKED:${graph.id}`,
      );
    }
    await updateRow("creative_production_graphs", graph.id, {
      status: "SUPERSEDED",
      metadata: {
        ...object(graph.metadata),
        superseded_for_replan: true,
        superseded_at: supersededAt,
        superseded_reason:
          "TEMPORAL_SEMANTIC_PLAN_VALIDATION_FAILED_BEFORE_EXECUTION",
      },
    });
  }

  const assets = await rows("creative_asset_nodes", {
    organization_id,
    creative_project_id,
    order: "created_at",
  });
  for (const asset of assets) {
    if (
      asset.type !== "PRODUCTION_DOSSIER" ||
      text(asset.status).toUpperCase() === "APPROVED"
    ) continue;

    await updateRow("creative_asset_nodes", asset.id, {
      status: "ARCHIVED",
      metadata: {
        ...object(asset.metadata),
        superseded_for_replan: true,
        superseded_at: supersededAt,
        superseded_reason:
          "TEMPORAL_SEMANTIC_PLAN_VALIDATION_FAILED_BEFORE_EXECUTION",
      },
    });
  }

  return {
    superseded_task_count: tasks.length,
    superseded_graph_count: graphs.length,
    archived_dossier_count: assets.filter((asset) =>
      asset.type === "PRODUCTION_DOSSIER" &&
      text(asset.status).toUpperCase() !== "APPROVED",
    ).length,
  };
}

async function convergeRepairedPlan(input = {}, result = {}) {
  const plan = repairedPlan(result);
  if (!plan) return result;

  const organizationId = text(input.organization_id);
  const projectId = text(input.project?.id || input.creative_project_id);
  if (!organizationId || !projectId) {
    throw new Error("TEMPORAL_SEMANTIC_REPLAN_SCOPE_REQUIRED");
  }

  const evidence = await supersedeDerivedWork({
    organization_id: organizationId,
    creative_project_id: projectId,
  });

  await convergeStrategy({
    organization_id: organizationId,
    creative_project_id: projectId,
    plan,
    validation: result.validation,
  });
  await convergeConcept({
    organization_id: organizationId,
    creative_project_id: projectId,
    plan,
    validation: result.validation,
  });
  await convergeStoryboard({
    organization_id: organizationId,
    creative_project_id: projectId,
    plan,
    validation: result.validation,
  });
  await convergeScenesAndShots({
    organization_id: organizationId,
    creative_project_id: projectId,
    plan,
  });

  const convergence = {
    contract: CONTRACT,
    applied: true,
    schema_safe: true,
    provider_execution_performed: false,
    wallet_reservation_performed: false,
    ...evidence,
  };

  return {
    ...result,
    plan: {
      ...plan,
      validation: {
        ...object(plan.validation),
        temporal_semantic_replan_convergence: convergence,
      },
    },
    validation: {
      ...object(result.validation),
      temporal_semantic_replan_convergence: convergence,
    },
  };
}

function installTaskFilter() {
  if (ProductionTaskRuntime[TASK_LIST_FLAG]) return;
  const listWithoutFilter = ProductionTaskRuntime.list.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, TASK_LIST_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  ProductionTaskRuntime.list = async function listWithoutSuperseded(
    input = {},
  ) {
    const tasks = await listWithoutFilter(input);
    return tasks.filter(
      (task) => task.metadata?.superseded_for_replan !== true,
    );
  };
}

function install() {
  installTaskFilter();
  if (CreativeMasterPlanRuntime[INSTALL_FLAG]) return;

  const createWithoutConvergence =
    CreativeMasterPlanRuntime.create.bind(CreativeMasterPlanRuntime);

  Object.defineProperty(CreativeMasterPlanRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeMasterPlanRuntime.create =
    async function createWithTemporalSemanticReplanConvergence(input = {}) {
      const result = await createWithoutConvergence(input);
      return convergeRepairedPlan(input, result);
    };
}

install();

export const CreativeTemporalSemanticReplanConvergenceRuntimeV2 = {
  installed: true,
  converge: convergeRepairedPlan,
};
