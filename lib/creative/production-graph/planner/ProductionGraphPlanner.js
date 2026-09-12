import {
  createProductionGraph,
  createProductionNode,
  createProductionEdge,
} from "../documents/ProductionGraph";

import { buildShotPrevisualizationBlueprint } from "../../quality/runtime/CreativeShotPrevisualizationBlueprintRuntime.js";
import { buildDepartmentHandoffChain } from "../../quality/runtime/CreativeDepartmentHandoffChainRuntime.js";
import {
  buildShotCinematicDna,
  evaluateShotCinematicDna,
} from "../../video/runtime/CreativeShotCinematicDnaRuntime.js";
import {
  buildCreativeFrameDesign,
  evaluateCreativeFrameDesign,
} from "../../video/runtime/CreativeFrameDesignRuntime.js";
import {
  buildShotPhysicalWorld,
  evaluateShotPhysicalWorld,
} from "../../video/runtime/CreativeShotPhysicalWorldRuntime.js";
import {
  CreativeFilmVisualJourneyRuntime,
} from "../../video/runtime/CreativeFilmVisualJourneyRuntime.js";
import {
  createProductionRoomPlan,
  productionEntryGate,
} from "../../production-room/runtime/CreativeProductionRoomRuntime.js";
import {
  evaluateProductionOffice,
} from "../../production-room/runtime/CreativeProductionOfficeRuntime.js";
import {
  createCurrentRoomWorkOrders,
} from "../../production-room/runtime/CreativeProductionWorkOrderRuntime.js";

function compact(values = []) {
  return [
    ...new Set(
      values
        .flat()
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function assetId(value) {
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return /^(?:\[object Object\]|undefined|null)$/i.test(id) ? "" : id;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return String(
    value.asset_id ||
    value.assetId ||
    value.creative_asset_id ||
    value.creativeAssetId ||
    value.id ||
    "",
  ).trim();
}

function assetIds(values = []) {
  return [...new Set(list(values).map(assetId).filter(Boolean))];
}

function storyLineage(value = {}) {
  return object(
    value.story_lineage ||
    value.metadata?.story_lineage,
  );
}

function lineageMetadata(value = {}) {
  const lineage = storyLineage(value);
  return {
    story_lineage: lineage,
    research_identity: lineage.research_identity || null,
    business_context_hash: lineage.business_context_hash || null,
    industry_context_hash: lineage.industry_context_hash || null,
    selected_concept_hash: lineage.selected_concept_hash || null,
    concept_council_hash: lineage.concept_council_hash || null,
    story_contract_hash: lineage.story_contract_hash || null,
    master_plan_hash: lineage.master_plan_hash || null,
    approval_plan_hash: lineage.approval_plan_hash || null,
  };
}

function sceneIntent(scene = {}) {
  return {
    objective: scene.objective || "",
    emotion: scene.emotion || "",
    story_state_before:
      scene.story_state_before ||
      scene.metadata?.story_state_before ||
      "",
    state_change:
      scene.state_change ||
      scene.metadata?.state_change ||
      "",
    story_state_after:
      scene.story_state_after ||
      scene.metadata?.story_state_after ||
      "",
    transition_logic:
      scene.transition_logic ||
      scene.metadata?.transition_logic ||
      "",
    location: scene.location || {},
    actors: scene.actors || [],
    products: scene.products || [],
    visual_style: scene.visual_style || {},
    camera_style: scene.camera_style || {},
    coverage_plan: object(scene.coverage_plan),
    audio_style: scene.audio_style || {},
    brand_rules: scene.brand_rules || [],
    story_function: scene.story_function || scene.metadata?.story_function || null,
    continuity_from_previous:
      scene.continuity_from_previous ||
      scene.metadata?.continuity_from_previous ||
      {},
    continuity_to_next:
      scene.continuity_to_next ||
      scene.metadata?.continuity_to_next ||
      {},
  };
}

function visibleSubject(shot = {}) {
  return text(
    shot.subject ||
    shot.metadata?.subject,
  );
}

function shotRequirements(scene = {}, shot = {}, creativePlan = {}) {
  const framePlan = object(shot.frame_plan);
  const audio = object(shot.audio);
  const actors = list(shot.actors).length ? shot.actors : scene.actors || [];
  const products = list(shot.products).length ? shot.products : scene.products || [];
  const location = Object.keys(object(shot.location)).length
    ? shot.location
    : scene.location || {};
  const mood = shot.lighting?.mood || scene.emotion || "";
  const subject = visibleSubject(shot);
  if (!subject) {
    throw new Error(
      `CREATIVE_SHOT_VISIBLE_SUBJECT_REQUIRED:${shot.id || shot.title || "unknown"}`,
    );
  }
  const tags = compact([
    scene.title,
    scene.objective,
    scene.emotion,
    shot.title,
    shot.purpose,
    subject,
    mood,
    Object.values(location || {}),
    actors.map((actor) => actor?.name || actor?.id || actor?.role || actor),
    products.map((product) => product?.name || product?.id || product),
  ]);
  const primarySourceAssetId = assetId(
    shot.primary_source_asset_id ||
    shot.generation?.primary_source_asset_id ||
    shot.metadata?.primary_source_asset_id,
  ) || null;

  return {
    scene_context: sceneIntent(scene),
    cinematic_coverage: object(creativePlan.cinematic_coverage),
    scene_coverage_plan: object(scene.coverage_plan),
    coverage: object(shot.coverage),
    subject,
    purpose: shot.purpose || "",
    mood,
    action: shot.action || "",
    performance:
      shot.performance ||
      shot.performance_direction ||
      {},
    performance_direction:
      shot.performance_direction ||
      shot.performance ||
      {},
    location,
    actors,
    products,
    frame_plan: framePlan,
    opening_frame: framePlan.opening_frame || shot.opening_frame || {},
    progression_frames:
      framePlan.progression_frames ||
      framePlan.progression ||
      shot.progression_frames ||
      [],
    closing_frame: framePlan.closing_frame || shot.closing_frame || {},
    camera: shot.camera || {},
    aerial_cinematography: object(shot.aerial_cinematography || shot.metadata?.aerial_cinematography),
    creative_grounding: object(shot.creative_grounding || shot.metadata?.creative_grounding),
    virtual_camera_state: shot.virtual_camera_state || {},
    lighting: shot.lighting || {},
    production_design: shot.production_design || {},
    wardrobe: shot.wardrobe || [],
    hair_makeup: shot.hair_makeup || [],
    props: shot.props || [],
    continuity: shot.continuity || {},
    continuity_bible: scene.continuity_bible || {},
    cinematic_grammar: scene.cinematic_grammar || {},
    beauty_system: scene.beauty_system || {},
    beauty_intent: shot.beauty_intent || null,
    focal_path: shot.focal_path || null,
    depth_layers: shot.depth_layers || null,
    persistent_subject_lock:
      shot.persistent_subject_lock || scene.persistent_subject_lock || {},
    reveal_stage: shot.reveal_stage || null,
    mystery_function: shot.mystery_function || null,
    inherited_world_state: shot.inherited_world_state || null,
    subject_class: shot.subject_class || null,
    subject_signature: shot.subject_signature || {},
    hero_asset_truth: shot.hero_asset_truth || {},
    technical_truth_evidence: shot.technical_truth_evidence || {},
    subject_identity_key: shot.subject_identity_key || null,
    world_identity_key: shot.world_identity_key || null,
    inherits_subject_identity: shot.inherits_subject_identity === true,
    inherits_world_identity: shot.inherits_world_identity === true,
    mechanical_truth: shot.mechanical_truth || null,
    mechanical_signature: shot.mechanical_signature || {},
    world_geometry_anchor: shot.world_geometry_anchor || null,
    world_topology: list(shot.world_topology),
    geography_claim: shot.geography_claim || "NONE",
    geography_proof: list(shot.geography_proof),
    geography_signature: shot.geography_signature || {},
    human_purpose: shot.human_purpose || "NONE",
    black_frame: shot.black_frame === true,
    black_frame_purpose: shot.black_frame_purpose || "NONE",
    subject_motion_choreography: shot.subject_motion_choreography || {},
    camera_feasibility: shot.camera_feasibility || null,
    continuity_invariants: list(shot.continuity_invariants),
    dialogue: shot.dialogue || [],
    narration: shot.narration || {},
    music: audio.music || shot.music || {},
    sound_effects: audio.sound_effects || shot.sound_effects || [],
    audio: Object.keys(audio).length ? audio : shot.sound_design || {},
    subtitles: shot.subtitles || [],
    graphics: shot.graphics || [],
    typography: shot.typography || {},
    vfx: shot.vfx || [],
    transition_in: shot.transition_in || {},
    transition_out: shot.transition_out || {},
    brand_rules: scene.brand_rules || [],
    must_avoid:
      shot.must_avoid ||
      shot.metadata?.must_avoid ||
      scene.metadata?.must_avoid ||
      [],
    negative_constraints: shot.negative_constraints || [],
    known_failure_modes: shot.known_failure_modes || [],
    repair_instructions: compact([
      shot.repair_instructions || [],
      shot.generation?.repair_instructions || [],
      shot.repair_contract?.instructions || [],
      shot.generation?.repair_contract?.instructions || [],
    ]),
    primary_source_asset_id: primarySourceAssetId,
    source_binding_contract: primarySourceAssetId
      ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
      : null,
    reference_asset_ids: assetIds(shot.reference_asset_ids || []),
    reference_assets: list(shot.reference_assets),
    identity_requirements: shot.identity_requirements || {},
    product_requirements: shot.product_requirements || {},
    rights_requirements: shot.rights_requirements || {},
    output_spec: shot.output_spec || shot.generation?.output_spec || {},
    reuse_policy: shot.reuse_policy || shot.metadata?.reuse_policy || {},
    minimum_quality: Number(
      shot.metadata?.minimum_quality ||
      scene.metadata?.minimum_quality ||
      0,
    ),
    tags,
    ...lineageMetadata(shot),
  };
}

function generationContract(scene = {}, shot = {}, existingAssets = []) {
  const generation = object(shot.generation || shot.metadata?.generation);
  const service =
    generation.service ||
    shot.service_id ||
    shot.service_code ||
    scene.service_id ||
    scene.service_code ||
    null;
  const capability =
    generation.capability ||
    shot.capability ||
    scene.capability ||
    service ||
    null;
  const required = generation.required ?? existingAssets.length === 0;
  const primarySourceAssetId = assetId(
    generation.primary_source_asset_id ||
    shot.primary_source_asset_id ||
    shot.metadata?.primary_source_asset_id,
  ) || null;

  if (required && (!service || !capability)) {
    throw new Error(
      `CREATIVE_SHOT_EXECUTION_CAPABILITY_REQUIRED:${shot.id || shot.title || "unknown"}`,
    );
  }
  if (required && existingAssets.length > 1 && !primarySourceAssetId) {
    throw new Error(
      `CREATIVE_SHOT_PRIMARY_SOURCE_REQUIRED:${shot.id || shot.title || "unknown"}`,
    );
  }
  if (
    primarySourceAssetId &&
    existingAssets.length &&
    !existingAssets.includes(primarySourceAssetId)
  ) {
    throw new Error(
      `CREATIVE_SHOT_PRIMARY_SOURCE_NOT_ASSIGNED:${shot.id || shot.title || "unknown"}:${primarySourceAssetId}`,
    );
  }

  const {
    prompt: ignoredPrompt,
    provider_prompt: ignoredProviderPrompt,
    negative_prompt: ignoredNegativePrompt,
    visual_prompt: ignoredVisualPrompt,
    video_prompt: ignoredVideoPrompt,
    ...structuredGeneration
  } = generation;

  return {
    ...structuredGeneration,
    required,
    service,
    capability,
    provider: generation.provider || null,
    primary_source_asset_id: primarySourceAssetId,
    source_binding_contract: primarySourceAssetId
      ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
      : null,
    provider_parameters: {
      ...object(generation.provider_parameters || shot.provider_parameters),
      primary_source_asset_id: primarySourceAssetId,
      source_binding_contract: primarySourceAssetId
        ? "EXPLICIT_SHOT_PRIMARY_SOURCE_V1"
        : null,
    },
    output_spec: generation.output_spec || shot.output_spec || {},
    repair_instructions: compact([
      generation.repair_instructions || [],
      shot.repair_instructions || [],
      generation.repair_contract?.instructions || [],
      shot.repair_contract?.instructions || [],
    ]),
    estimated_cost: Number(generation.estimated_cost || 0),
    estimated_seconds:
      generation.estimated_seconds ??
      shot.duration_seconds ??
      null,
    status: existingAssets.length ? "ASSET_ASSIGNED" : "WAITING",
    provider_prompt_persisted: false,
  };
}

export function buildProductionGraph({
  organization_id,
  creative_mission_id = null,
  creative_project_id,
  storyboard,
  scenes = [],
  shots = [],
  creative_plan = {},
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!storyboard?.id) throw new Error("storyboard required");
  if (!list(scenes).length) throw new Error("CREATIVE_PRODUCTION_SCENES_REQUIRED");
  if (!list(shots).length) throw new Error("CREATIVE_PRODUCTION_SHOTS_REQUIRED");

  const lineage = storyLineage(creative_plan);
  if (!text(lineage.story_contract_hash) || !text(lineage.master_plan_hash)) {
    throw new Error("CREATIVE_PRODUCTION_GRAPH_STORY_LINEAGE_REQUIRED");
  }

  const productionRoomBootstrap = object(creative_plan.production_room_bootstrap);
  const productionRoomStageInputs = object(productionRoomBootstrap.stage_inputs);
  const productionRoomPipeline =
    creative_plan.production_room_pipeline?.contract
      ? creative_plan.production_room_pipeline
      : createProductionRoomPlan({
          project_id: creative_project_id,
          master_plan_digest: lineage.master_plan_hash,
        });
  const productionRoomGate = productionEntryGate(productionRoomPipeline);
  if (!productionRoomGate.passed) {
    throw new Error(
      `CREATIVE_PRODUCTION_ENTRY_GATE_REQUIRED:${productionRoomGate.required_stage || "VIRTUAL_REHEARSAL"}`,
    );
  }
  const productionRoomInitialReports = Object.fromEntries(
    Object.entries(productionRoomStageInputs).map(([stageId, stageInput]) => [
      stageId,
      [
        ...list(stageInput?.supplied_workstream_reports),
        ...list(stageInput?.report?.workstream_reports),
      ],
    ]),
  );

  const visualJourney = CreativeFilmVisualJourneyRuntime.build({ shots, scenes, creative_plan });
  const visualJourneyGate = CreativeFilmVisualJourneyRuntime.evaluate(visualJourney);
  if (!visualJourneyGate.passed) {
    throw new Error(`CREATIVE_FILM_VISUAL_JOURNEY_REQUIRED:${visualJourneyGate.failures.join(",")}`);
  }

  const departmentBreakdown =
    productionRoomStageInputs.DEPARTMENT_BREAKDOWN?.report ||
    creative_plan.production_room_pipeline?.stage_inputs?.DEPARTMENT_BREAKDOWN?.report ||
    null;
  const productionOffice = evaluateProductionOffice({
    plan: productionRoomPipeline,
    reports_by_stage: productionRoomInitialReports,
  });
  const productionWorkOrders = createCurrentRoomWorkOrders({
    office: productionOffice,
    reports_by_stage: productionRoomInitialReports,
  });

  const graph = createProductionGraph({
    organization_id,
    creative_project_id,
    storyboard_id: storyboard.id,
    title: storyboard.title || creative_plan.concept?.title || "",
    description: storyboard.synopsis || creative_plan.concept?.narrative || "",
    cost_plan: {
      currency: creative_plan.production?.currency || null,
      approval_required: creative_plan.production?.cost_approval_required ?? null,
      approved: creative_plan.production?.cost_approved ?? null,
    },
    production_plan: {
      quality_profile: creative_plan.production?.quality_profile || null,
      draft_first: creative_plan.production?.draft_first ?? null,
      reuse_assets: creative_plan.production?.reuse_assets ?? null,
      provider_strategy: creative_plan.production?.provider_strategy || null,
      render_modes: creative_plan.production?.render_modes || [],
    },
    metadata: {
      creative_mission_id,
      workflow_kind: creative_plan.workflow_kind || null,
      master_plan_validation: creative_plan.validation || null,
      cinematic_coverage: object(creative_plan.cinematic_coverage),
      selected_asset_manifest: creative_plan.asset_manifest || [],
      asset_binding_contract:
        creative_plan.asset_binding?.primary_source_contract || null,
      role_decisions:
        creative_plan.role_decisions ||
        creative_plan.agency_decisions ||
        {},
      deliverables: creative_plan.deliverables || [],
      production_room_pipeline: productionRoomPipeline,
      production_room_stage_inputs: productionRoomStageInputs,
      production_room_workstream_reports: productionRoomInitialReports,
      production_room_entry_gate: productionRoomGate,
      production_office: productionOffice,
      production_work_orders: productionWorkOrders,
      ...lineageMetadata(creative_plan),
      provider_prompts_persisted: false,
    },
  });

  const productionUnits = list(departmentBreakdown?.units);
  for (const unit of productionUnits) {
    const unitNodeId = `unit:${creative_project_id}:${unit.unit_id}`;
    graph.nodes.push(createProductionNode({
      id: unitNodeId,
      type: "UNIT",
      title: unit.unit_id,
      description: `Governed production coverage unit ${unit.unit_id}`,
      requirements: {
        shot_ids: list(unit.shot_ids),
        department_breakdown_contract: departmentBreakdown?.contract || null,
        department_breakdown_passed: departmentBreakdown?.passed === true,
      },
      metadata: {
        unit_id: unit.unit_id,
        creative_mission_id,
        provider_execution_allowed: false,
      },
    }));
  }

  for (const scene of scenes) {
    graph.nodes.push(
      createProductionNode({
        id: scene.id,
        type: "SCENE",
        title: scene.title,
        description: scene.objective || "",
        duration_seconds: scene.duration_seconds,
        intent: sceneIntent(scene),
        requirements: {
          brand_rules: scene.brand_rules || [],
          location: scene.location || {},
          actors: scene.actors || [],
          products: scene.products || [],
          visual_style: scene.visual_style || {},
          camera_style: scene.camera_style || {},
          coverage_plan: object(scene.coverage_plan),
          cinematic_coverage: object(creative_plan.cinematic_coverage),
          audio_style: scene.audio_style || {},
          story_state_before:
            scene.story_state_before ||
            scene.metadata?.story_state_before ||
            "",
          state_change:
            scene.state_change ||
            scene.metadata?.state_change ||
            "",
          story_state_after:
            scene.story_state_after ||
            scene.metadata?.story_state_after ||
            "",
          transition_logic:
            scene.transition_logic ||
            scene.metadata?.transition_logic ||
            "",
          ...lineageMetadata(scene),
        },
        metadata: {
          scene_number: scene.scene_number,
          creative_mission_id,
          coverage_plan: object(scene.coverage_plan),
          story_function:
            scene.story_function ||
            scene.metadata?.story_function ||
            null,
          master_plan_index: scene.metadata?.master_plan_index ?? null,
          ...lineageMetadata(scene),
        },
      }),
    );

    const sceneShots = shots.filter((shot) => shot.scene_id === scene.id);
    if (!sceneShots.length) {
      throw new Error(`CREATIVE_SCENE_SHOTS_REQUIRED:${scene.id}`);
    }

    for (const shot of sceneShots) {
      const previsualization = buildShotPrevisualizationBlueprint(shot);
      const departmentHandoff = buildDepartmentHandoffChain({
        previsualization,
        role_decisions: creative_plan.role_decisions || creative_plan.agency_decisions || {},
      });
      const cinematicDna = buildShotCinematicDna({ shot, scene, creative_plan });
      const cinematicDnaGate = evaluateShotCinematicDna(cinematicDna);
      if (!cinematicDnaGate.passed) {
        throw new Error(`CREATIVE_SHOT_CINEMATIC_DNA_REQUIRED:${shot.id}:${cinematicDnaGate.failures.join(",")}`);
      }
      const frameDesign = buildCreativeFrameDesign({ shot, cinematic_dna: cinematicDna });
      const frameDesignGate = evaluateCreativeFrameDesign(frameDesign);
      if (!frameDesignGate.passed) {
        throw new Error(`CREATIVE_FRAME_DESIGN_REQUIRED:${shot.id}:${frameDesignGate.failures.join(",")}`);
      }
      const physicalWorld = buildShotPhysicalWorld({ shot, creative_plan });
      const physicalWorldGate = evaluateShotPhysicalWorld(physicalWorld);
      if (!physicalWorldGate.passed) {
        throw new Error(`CREATIVE_SHOT_PHYSICAL_WORLD_REQUIRED:${shot.id}:${physicalWorldGate.failures.join(",")}`);
      }
      const visualJourneyState = CreativeFilmVisualJourneyRuntime.shotState(visualJourney, shot.id);
      const requirements = {
        ...shotRequirements(scene, shot, creative_plan),
        cinematic_dna: cinematicDna,
        cinematic_dna_gate: cinematicDnaGate,
        frame_design: frameDesign,
        frame_design_gate: frameDesignGate,
        visual_state_conditioning: frameDesign.visual_state_conditioning,
        physical_world: physicalWorld,
        physical_world_gate: physicalWorldGate,
        film_visual_journey: visualJourney,
        film_visual_journey_gate: visualJourneyGate,
        visual_journey_state: visualJourneyState,
        previsualization_blueprint: previsualization,
        department_handoff_chain: departmentHandoff,
        production_room_pipeline: productionRoomPipeline,
        production_room_entry_gate: productionRoomGate,
      };
      const assignedAssets = assetIds(shot.assets || []);
      const referenceAssets = assetIds(
        list(shot.reference_assets).length
          ? shot.reference_assets
          : shot.reference_asset_ids || [],
      );
      const availableAssets = [...new Set([...assignedAssets, ...referenceAssets])];
      const generation = generationContract(scene, shot, assignedAssets);

      graph.nodes.push(
        createProductionNode({
          id: shot.id,
          type: "SHOT",
          title: shot.title,
          description: shot.purpose || "",
          duration_seconds: shot.duration_seconds,
          intent: {
            purpose: shot.purpose || "",
            subject: visibleSubject(shot),
            action: shot.action || "",
            performance:
              shot.performance ||
              shot.performance_direction ||
              {},
            coverage: object(shot.coverage),
            scene_coverage_plan: object(scene.coverage_plan),
            scene_objective: scene.objective || "",
            scene_state_before:
              scene.story_state_before ||
              scene.metadata?.story_state_before ||
              "",
            scene_state_change:
              scene.state_change ||
              scene.metadata?.state_change ||
              "",
            scene_state_after:
              scene.story_state_after ||
              scene.metadata?.story_state_after ||
              "",
            scene_transition_logic:
              scene.transition_logic ||
              scene.metadata?.transition_logic ||
              "",
            emotion: scene.emotion || "",
            medium: shot.medium || scene.medium || null,
            frame_plan: object(shot.frame_plan),
            opening_frame:
              shot.frame_plan?.opening_frame ||
              shot.opening_frame ||
              {},
            progression_frames:
              shot.frame_plan?.progression_frames ||
              shot.frame_plan?.progression ||
              shot.progression_frames ||
              [],
            closing_frame:
              shot.frame_plan?.closing_frame ||
              shot.closing_frame ||
              {},
          },
          requirements,
          assets: assignedAssets,
          generation,
          metadata: {
            scene_id: scene.id,
            scene_number: scene.scene_number,
            shot_number: shot.shot_number,
            coverage_contract: creative_plan.cinematic_coverage?.contract || null,
            coverage: object(shot.coverage),
            scene_coverage_plan: object(scene.coverage_plan),
            tags: requirements.tags,
            medium: shot.medium || scene.medium || null,
            creative_mission_id,
            primary_source_asset_id: generation.primary_source_asset_id,
            source_binding_contract: generation.source_binding_contract,
            provider_parameters: generation.provider_parameters,
            repair_instructions: requirements.repair_instructions,
            frame_plan: object(shot.frame_plan),
            reference_asset_ids: referenceAssets,
            available_asset_ids: availableAssets,
            reuse_policy: requirements.reuse_policy,
            provider_prompt_persisted: false,
            ...lineageMetadata(shot),
          },
        }),
      );

      graph.edges.push(
        createProductionEdge({
          from: scene.id,
          to: shot.id,
          type: "CONTAINS",
        }),
      );

      const assignment = list(departmentBreakdown?.shot_assignments)
        .find((item) => text(item.shot_id) === text(shot.id));
      for (const unitId of list(assignment?.unit_ids)) {
        graph.edges.push(createProductionEdge({
          from: `unit:${creative_project_id}:${unitId}`,
          to: shot.id,
          type: "CONTAINS",
          metadata: { coverage_purpose: assignment.coverage_purpose || shot.purpose || "" },
        }));
      }

      const takeLimit = Math.min(6, Math.max(0, Number(departmentBreakdown?.take_strategy?.max_takes_per_shot || 0)));
      for (let takeIndex = 1; takeIndex <= takeLimit; takeIndex += 1) {
        const takeId = `take:${shot.id}:${takeIndex}`;
        graph.nodes.push(createProductionNode({
          id: takeId,
          type: "TAKE",
          title: `${shot.title || shot.id} · Take ${takeIndex}`,
          description: `Planned take option ${takeIndex}; execution is not authorized by planning.`,
          requirements: {
            shot_id: shot.id,
            take_index: takeIndex,
            editorial_value_required: true,
            dailies_approval_required: true,
            continuity_keys: list(assignment?.continuity_keys),
          },
          metadata: {
            scene_id: scene.id,
            creative_mission_id,
            provider_execution_allowed: false,
            planned_only: true,
          },
        }));
        graph.edges.push(createProductionEdge({ from: shot.id, to: takeId, type: "CONTAINS" }));
      }
    }
  }

  return graph;
}
