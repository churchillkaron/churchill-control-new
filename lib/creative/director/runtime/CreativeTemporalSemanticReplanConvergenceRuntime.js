import {
  CreativeMasterPlanRuntime,
} from "./CreativeMasterPlanRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.temporal-semantic-replan-convergence.v1",
);
const TASK_LIST_FLAG = Symbol.for(
  "avantiqo.creative.temporal-semantic-replan-task-filter.v1",
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
  if (!strategy) return;

  await updateRow("creative_strategies", strategy.id, {
    title: plan.concept?.title || strategy.title,
    creative_angle: plan.concept?.hook || strategy.creative_angle,
    core_message: plan.concept?.message || strategy.core_message,
    story_direction: plan.concept?.narrative || strategy.story_direction,
    visual_direction: {
      visual_system: plan.concept?.visual_system || {},
      camera_language: plan.concept?.camera_language || {},
      lighting_system: plan.concept?.lighting_system || {},
      production_design: plan.concept?.production_design || {},
      typography_system: plan.concept?.typography_system || {},
    },
    production_direction: {
      target_duration: list(plan.scenes).reduce(
        (sum, scene) => sum + Number(scene.duration_seconds || 0),
        0,
      ),
      deliverables: plan.deliverables || [],
      production: plan.production || {},
      quality: plan.quality || {},
    },
    metadata: {
      ...object(strategy.metadata),
      master_plan_validation: validation,
      temporal_semantic_replan_converged: true,
      temporal_semantic_replan_contract:
        "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V1",
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
  if (!concept) return;

  const semanticId = text(plan.concept?.id || plan.selected_concept_id);
  await updateRow("creative_concepts", concept.id, {
    title: plan.concept?.title || concept.title,
    hook: plan.concept?.hook || concept.hook,
    message: plan.concept?.message || concept.message,
    narrative: plan.concept?.narrative || concept.narrative,
    visual_system: plan.concept?.visual_system || concept.visual_system,
    camera_language:
      plan.concept?.camera_language || concept.camera_language,
    lighting_system:
      plan.concept?.lighting_system || concept.lighting_system,
    production_design:
      plan.concept?.production_design || concept.production_design,
    metadata: {
      ...object(concept.metadata),
      ...(semanticId ? { semantic_concept_id: semanticId } : {}),
      master_plan_quality: plan.quality || {},
      master_plan_validation: validation,
      temporal_semantic_replan_converged: true,
      temporal_semantic_replan_contract:
        "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V1",
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
  if (!storyboard) return;

  await updateRow("creative_storyboards", storyboard.id, {
    title: plan.concept?.title || storyboard.title,
    synopsis:
      plan.concept?.narrative ||
      plan.concept?.message ||
      storyboard.synopsis,
    total_duration: list(plan.scenes).reduce(
      (sum, scene) => sum + Number(scene.duration_seconds || 0),
      0,
    ),
    metadata: {
      ...object(storyboard.metadata),
      master_plan_quality: plan.quality || {},
      master_plan_validation: validation,
      story_architecture: plan.story_architecture || {},
      temporal_semantic_replan_converged: true,
      temporal_semantic_replan_contract:
        "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V1",
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
      `TEMPORAL_SEMANTIC_REPLAN_SCENE_COUNT_MISMATCH:${scenes.length}:${planScenes.length}`,
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
        `TEMPORAL_SEMANTIC_REPLAN_SHOT_COUNT_MISMATCH:${sceneIndex + 1}:${sceneShots.length}:${planShots.length}`,
      );
    }

    await updateRow("creative_scenes", scene.id, {
      title: scenePlan.title,
      objective: scenePlan.objective,
      emotion: scenePlan.emotion,
      duration_seconds: scenePlan.duration_seconds,
      location: scenePlan.location || {},
      actors: scenePlan.actors || [],
      products: scenePlan.products || [],
      brand_rules: scenePlan.brand_rules || [],
      visual_style: scenePlan.visual_style || {},
      camera_style: scenePlan.camera_style || {},
      audio_style: scenePlan.audio_style || {},
      metadata: {
        ...object(scene.metadata),
        master_plan_index: sceneIndex,
        story_function: scenePlan.story_function || null,
        story_state_before: scenePlan.story_state_before || null,
        state_change: scenePlan.state_change || null,
        story_state_after: scenePlan.story_state_after || null,
        transition_logic: scenePlan.transition_logic || null,
        temporal_semantic_replan_converged: true,
        temporal_semantic_replan_contract:
          "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V1",
      },
    });

    for (const [shotIndex, shot] of sceneShots.entries()) {
      const shotPlan = planShots[shotIndex];
      await updateRow("creative_shots", shot.id, {
        title: shotPlan.title,
        purpose: shotPlan.purpose,
        subject: shotPlan.subject,
        action: shotPlan.action,
        performance: shotPlan.performance,
        duration_seconds: shotPlan.duration_seconds,
        medium: shotPlan.medium,
        opening_frame:
          shotPlan.frame_plan?.opening_frame ||
          shotPlan.opening_frame ||
          shot.opening_frame,
        progression_frames:
          shotPlan.frame_plan?.progression ||
          shotPlan.progression_frames ||
          shot.progression_frames,
        closing_frame:
          shotPlan.frame_plan?.closing_frame ||
          shotPlan.closing_frame ||
          shot.closing_frame,
        camera: shotPlan.camera || {},
        lighting: shotPlan.lighting || {},
        production_design: shotPlan.production_design || {},
        continuity: shotPlan.continuity || {},
        actors: shotPlan.actors || scenePlan.actors || [],
        products: shotPlan.products || scenePlan.products || [],
        location: shotPlan.location || scenePlan.location || {},
        dialogue: shotPlan.dialogue || [],
        narration: shotPlan.narration || {},
        music: shotPlan.music || {},
        sound_effects:
          shotPlan.sound_effects ||
          shotPlan.audio?.sound_effects ||
          [],
        sound_design: shotPlan.sound_design || shotPlan.audio || {},
        subtitles: shotPlan.subtitles || [],
        graphics: shotPlan.graphics || {},
        typography: shotPlan.typography || {},
        vfx: shotPlan.vfx || {},
        transition_in: shotPlan.transition_in,
        transition_out: shotPlan.transition_out,
        negative_constraints: shotPlan.negative_constraints || [],
        reference_asset_ids: shotPlan.reference_asset_ids || [],
        identity_requirements: shotPlan.identity_requirements || {},
        product_requirements: shotPlan.product_requirements || {},
        rights_requirements: shotPlan.rights_requirements || {},
        output_spec: shotPlan.output_spec || {},
        provider_prompt:
          shotPlan.generation?.provider_prompt ||
          shotPlan.provider_prompt ||
          null,
        provider_parameters:
          shotPlan.generation?.provider_parameters ||
          shotPlan.provider_parameters ||
          {},
        repair_contract: shotPlan.repair_contract || {},
        reuse_policy: shotPlan.reuse_policy || {},
        generation: shotPlan.generation || {},
        metadata: {
          ...object(shot.metadata),
          master_plan_scene_index: sceneIndex,
          master_plan_shot_index: shotIndex,
          temporal_semantic_replan_converged: true,
          temporal_semantic_replan_contract:
            "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V1",
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
    if (["RUNNING", "COMPLETED"].includes(text(task.status).toUpperCase())) {
      throw new Error(
        `TEMPORAL_SEMANTIC_REPLAN_EXECUTED_TASK_BLOCKED:${task.id}:${task.status}`,
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
      throw new Error(`TEMPORAL_SEMANTIC_REPLAN_APPROVED_GRAPH_BLOCKED:${graph.id}`);
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

  return {
    ...result,
    plan: {
      ...plan,
      validation: {
        ...object(plan.validation),
        temporal_semantic_replan_convergence: {
          contract:
            "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V1",
          applied: true,
          ...evidence,
        },
      },
    },
    validation: {
      ...object(result.validation),
      temporal_semantic_replan_convergence: {
        contract:
          "CREATIVE_TEMPORAL_SEMANTIC_REPLAN_CONVERGENCE_V1",
        applied: true,
        ...evidence,
      },
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
  ProductionTaskRuntime.list = async function listWithoutSuperseded(input = {}) {
    const tasks = await listWithoutFilter(input);
    return tasks.filter((task) => task.metadata?.superseded_for_replan !== true);
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

export const CreativeTemporalSemanticReplanConvergenceRuntime = {
  installed: true,
  converge: convergeRepairedPlan,
};
