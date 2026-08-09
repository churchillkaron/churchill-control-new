import { ResearchRuntime } from "@/lib/creative/research/runtime/ResearchRuntime";
import { CreativeStrategyRuntime } from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";
import { CreativeConceptRuntime } from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";
import { StoryboardRuntime } from "@/lib/creative/storyboard/runtime/StoryboardRuntime";
import { SceneRuntime } from "@/lib/creative/scenes/runtime/SceneRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeBrandFidelityRuntime } from "@/lib/creative/assets/intelligence/runtime/CreativeBrandFidelityRuntime";

const CONTRACT = "CREATIVE_PIPELINE_STORY_ASSET_PREVIEW_V1";

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

function upper(value) {
  return text(value).toUpperCase();
}

function unique(values = []) {
  return [...new Set(
    list(values)
      .flat(Infinity)
      .map((value) => text(value))
      .filter(Boolean),
  )];
}

function timestamp(value = {}) {
  const parsed = Date.parse(value.created_at || value.updated_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function lineage(value = {}) {
  const metadata = object(value.metadata);
  const nested = object(metadata.story_lineage || value.story_lineage);
  return {
    research_report_id: nested.research_report_id || metadata.research_report_id || null,
    research_identity: nested.research_identity || metadata.research_identity || null,
    selected_concept_hash: nested.selected_concept_hash || metadata.selected_concept_hash || null,
    story_contract_hash: nested.story_contract_hash || metadata.story_contract_hash || null,
    master_plan_hash: nested.master_plan_hash || metadata.master_plan_hash || null,
  };
}

function lineageKey(value = {}) {
  const candidate = lineage(value);
  return candidate.master_plan_hash && candidate.story_contract_hash
    ? `${candidate.master_plan_hash}:${candidate.story_contract_hash}`
    : null;
}

function latestLineage(...collections) {
  const candidate = collections
    .flatMap((items) => list(items))
    .filter((item) => lineageKey(item))
    .sort((left, right) => timestamp(right) - timestamp(left))[0];
  return candidate ? lineage(candidate) : null;
}

function sameLineage(value = {}, target = {}) {
  const candidate = lineage(value);
  return Boolean(
    candidate.master_plan_hash &&
    candidate.story_contract_hash &&
    candidate.master_plan_hash === target.master_plan_hash &&
    candidate.story_contract_hash === target.story_contract_hash
  );
}

function newest(items = []) {
  return [...list(items)].sort((left, right) => timestamp(right) - timestamp(left))[0] || null;
}

function generatedVisualShot(shot = {}) {
  const capability = text(
    shot.generation?.capability ||
    shot.generation?.service ||
    shot.capability ||
    shot.service_code,
  ).toLowerCase();
  return shot.generation?.required === true &&
    (capability.includes("image") || capability.includes("video"));
}

function generatedVisualTask(task = {}) {
  const type = upper(task.type);
  const capability = text(task.capability || task.service_code).toLowerCase();
  return ["GENERATE_IMAGE", "GENERATE_VIDEO", "IMAGE_TO_VIDEO"].includes(type) ||
    capability.includes("image.generate") ||
    capability.includes("video.generate");
}

function primarySourceId(value = {}) {
  const references = list(value.reference_assets);
  return text(
    value.primary_source_asset_id ||
    value.generation?.primary_source_asset_id ||
    value.generation?.provider_parameters?.primary_source_asset_id ||
    value.input?.primary_source_asset_id ||
    value.input?.generation?.primary_source_asset_id ||
    value.input?.requirements?.primary_source_asset_id ||
    references.find((item) => upper(item?.role) === "PRIMARY_SOURCE")?.asset_id ||
    references.find((item) => upper(item?.role) === "PRIMARY_SOURCE")?.id,
  ) || null;
}

function shotAssetIds(shot = {}) {
  return unique([
    list(shot.assets).map((item) => item?.asset_id || item?.id || item),
    list(shot.reference_assets).map((item) => item?.asset_id || item?.id || item),
    primarySourceId(shot),
  ]);
}

function taskAssetIds(task = {}) {
  const scope = object(task.input?.requirements?.asset_scope);
  return unique([
    scope.creative_asset_ids,
    scope.reference_asset_ids,
    scope.source_asset_ids,
    primarySourceId(task),
  ]);
}

function hasContract(rules = [], contract) {
  return list(rules).some((rule) => rule?.contract === contract);
}

async function loadAssetEvidence(ids = []) {
  const rows = await Promise.all(unique(ids).map(async (id) => {
    const asset = await CreativeAssetsRuntime.get(id);
    if (!asset) {
      return {
        id,
        found: false,
        classification: "MISSING",
        trusted_for_brand_fidelity_primary: false,
      };
    }
    const provenance = CreativeBrandFidelityRuntime.classify(asset);
    return {
      id,
      found: true,
      label: asset.name || asset.title || asset.file_name || id,
      asset_type: asset.asset_type || null,
      provider: asset.provider || null,
      engine: asset.engine || null,
      ai_generated: asset.ai_generated === true,
      analysis_status:
        asset.analysis?.status ||
        asset.metadata?.analysis_status ||
        asset.analysis_status ||
        null,
      direct_use_disposition:
        asset.analysis?.direct_use_disposition ||
        asset.metadata?.direct_use_disposition ||
        null,
      evidence_roles: list(asset.metadata?.evidence_roles),
      classification: provenance.classification,
      trusted_for_brand_fidelity_primary:
        provenance.trusted_for_brand_fidelity_primary === true,
    };
  }));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function buildCreativePipelinePreview({
  organization_id,
  creative_mission_id,
  creative_project_id,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_mission_id) throw new Error("creative_mission_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const scope = { organization_id, creative_mission_id, creative_project_id };
  const [research, strategies, concepts, storyboards, scenes, shots, graphs, tasks] =
    await Promise.all([
      ResearchRuntime.list({ organization_id, creative_project_id }),
      CreativeStrategyRuntime.list(scope),
      CreativeConceptRuntime.list(scope),
      StoryboardRuntime.list({ organization_id, creative_project_id }),
      SceneRuntime.list({ organization_id, creative_project_id }),
      ShotRuntime.list({ organization_id, creative_project_id }),
      ProductionGraphRuntime.list({ organization_id, creative_project_id }),
      ProductionTaskRuntime.list({ organization_id, creative_project_id }),
    ]);

  const canonical = latestLineage(
    storyboards,
    concepts,
    strategies,
    graphs,
    tasks,
    shots,
    scenes,
  );

  if (!canonical) {
    return {
      contract: CONTRACT,
      status: "NOT_PLANNED",
      ready_for_paid_generation: false,
      blocking_reasons: ["CREATIVE_PIPELINE_CANONICAL_LINEAGE_NOT_FOUND"],
      provider_calls_executed: false,
      paid_reasoning_executed: false,
      perceptual_review_executed: false,
      publication_authorized: false,
    };
  }

  const strategiesInLineage = list(strategies).filter((item) => sameLineage(item, canonical));
  const conceptsInLineage = list(concepts).filter((item) => sameLineage(item, canonical));
  const storyboardsInLineage = list(storyboards).filter((item) => sameLineage(item, canonical));
  const scenesInLineage = list(scenes).filter((item) => sameLineage(item, canonical));
  const shotsInLineage = list(shots).filter((item) => sameLineage(item, canonical));
  const graphsInLineage = list(graphs).filter((item) => sameLineage(item, canonical));
  const tasksInLineage = list(tasks).filter((item) => sameLineage(item, canonical));

  const researchReport = list(research).find((item) =>
    text(item.id) === text(canonical.research_report_id) ||
    text(item.metadata?.research_identity) === text(canonical.research_identity),
  ) || null;
  const strategy = newest(strategiesInLineage);
  const concept = newest(conceptsInLineage);
  const storyboard = newest(storyboardsInLineage);
  const graph = newest(graphsInLineage);
  const visualTasks = tasksInLineage.filter(generatedVisualTask);
  const generatedShots = shotsInLineage.filter(generatedVisualShot);

  const evidence = await loadAssetEvidence(unique([
    shotsInLineage.flatMap(shotAssetIds),
    visualTasks.flatMap(taskAssetIds),
  ]));
  const contracts = CreativeBrandFidelityRuntime.contracts;
  const blocking = [];

  if (!researchReport || researchReport.metadata?.validation?.passed !== true) {
    blocking.push("CREATIVE_PREVIEW_VALIDATED_RESEARCH_REQUIRED");
  }
  if (!strategy) blocking.push("CREATIVE_PREVIEW_STRATEGY_REQUIRED");
  if (!concept) blocking.push("CREATIVE_PREVIEW_CONCEPT_REQUIRED");
  if (!storyboard) blocking.push("CREATIVE_PREVIEW_STORYBOARD_REQUIRED");
  if (!scenesInLineage.length) blocking.push("CREATIVE_PREVIEW_SCENES_REQUIRED");
  if (!shotsInLineage.length) blocking.push("CREATIVE_PREVIEW_SHOTS_REQUIRED");
  if (!graph) blocking.push("CREATIVE_PREVIEW_PRODUCTION_GRAPH_REQUIRED");
  if (!visualTasks.length) blocking.push("CREATIVE_PREVIEW_PRODUCTION_TASKS_REQUIRED");

  const scenePreview = scenesInLineage
    .sort((left, right) => Number(left.scene_number) - Number(right.scene_number))
    .map((scene) => ({
      id: scene.id,
      scene_number: scene.scene_number,
      title: scene.title || null,
      objective: scene.objective || null,
      story_function: scene.metadata?.story_function || null,
      state_change: scene.metadata?.state_change || null,
      location: scene.location || {},
    }));

  const shotPreview = shotsInLineage
    .sort((left, right) =>
      Number(left.scene_number) - Number(right.scene_number) ||
      Number(left.shot_number) - Number(right.shot_number),
    )
    .map((shot) => {
      const primary = primarySourceId(shot);
      const primaryEvidence = primary ? evidence.get(primary) : null;
      const allIds = shotAssetIds(shot);
      const materializedIds = unique(
        list(shot.assets).map((item) => item?.asset_id || item?.id || item),
      );
      const issues = [];
      if (generatedVisualShot(shot) && !primary) issues.push("PRIMARY_SOURCE_MISSING");
      if (
        generatedVisualShot(shot) &&
        primary &&
        !materializedIds.includes(primary)
      ) {
        issues.push("PRIMARY_SOURCE_NOT_MATERIALIZED_ON_SHOT");
      }
      if (
        generatedVisualShot(shot) &&
        primaryEvidence?.trusted_for_brand_fidelity_primary !== true
      ) {
        issues.push(
          primaryEvidence?.classification === "SYNTHETIC"
            ? "PRIMARY_SOURCE_SYNTHETIC"
            : "PRIMARY_SOURCE_NOT_TRUSTED_AUTHENTIC",
        );
      }
      if (generatedVisualShot(shot) && !allIds.length) {
        issues.push("SHOT_ASSET_BINDING_MISSING");
      }
      if (issues.length) blocking.push(`SHOT_${shot.id}:${issues.join("+")}`);

      return {
        id: shot.id,
        scene_id: shot.scene_id,
        scene_number: shot.scene_number,
        shot_number: shot.shot_number,
        title: shot.title || null,
        purpose: shot.purpose || null,
        subject: shot.subject || null,
        action: shot.action || null,
        duration_seconds: Number(shot.duration_seconds || 0),
        generation_required: shot.generation?.required === true,
        capability:
          shot.generation?.capability ||
          shot.generation?.service ||
          shot.capability ||
          null,
        primary_source_asset_id: primary,
        primary_source_asset: primaryEvidence || null,
        reference_assets: allIds.map((id) => evidence.get(id) || { id, found: false }),
        materialized_asset_ids: materializedIds,
        issues,
      };
    });

  if (
    generatedShots.length > 0 &&
    Number(graph?.metadata?.generated_media_perceptual_review_count || 0) < generatedShots.length
  ) {
    blocking.push("CREATIVE_PREVIEW_PERCEPTUAL_REVIEW_COVERAGE_REQUIRED");
  }

  const taskPreview = visualTasks.map((task) => {
    const primary = primarySourceId(task);
    const primaryEvidence = primary ? evidence.get(primary) : null;
    const scopeContract = task.input?.requirements?.asset_scope?.contract || null;
    const rules = list(task.input?.requirements?.brand_rules);
    const issues = [];
    if (!primary) issues.push("TASK_PRIMARY_SOURCE_MISSING");
    if (scopeContract !== "STRICT_SHOT_ASSET_SCOPE_V3") {
      issues.push("TASK_STRICT_ASSET_SCOPE_MISSING");
    }
    if (!hasContract(rules, contracts.brand_truth)) {
      issues.push("TASK_BRAND_TRUTH_CONTRACT_MISSING");
    }
    if (!hasContract(rules, contracts.brand_fidelity)) {
      issues.push("TASK_BRAND_FIDELITY_CONTRACT_MISSING");
    }
    if (primary && primaryEvidence?.trusted_for_brand_fidelity_primary !== true) {
      issues.push("TASK_PRIMARY_SOURCE_NOT_TRUSTED_AUTHENTIC");
    }
    if (issues.length) blocking.push(`TASK_${task.id}:${issues.join("+")}`);

    return {
      id: task.id,
      type: task.type,
      status: task.status,
      capability: task.capability || task.service_code || null,
      primary_source_asset_id: primary,
      primary_source_asset: primaryEvidence || null,
      asset_scope_contract: scopeContract,
      asset_scope_hash: task.input?.requirements?.asset_scope?.scope_hash || null,
      brand_truth_bound: hasContract(rules, contracts.brand_truth),
      brand_fidelity_bound: hasContract(rules, contracts.brand_fidelity),
      perceptual_review_node_id:
        task.input?.requirements?.perceptual_review_node_id ||
        task.input?.provider_parameters?.perceptual_review_node_id ||
        task.input?.generation?.provider_parameters?.perceptual_review_node_id ||
        task.metadata?.perceptual_review_node_id ||
        null,
      issues,
    };
  });

  const blockingReasons = unique(blocking);
  const ready = blockingReasons.length === 0;

  return {
    contract: CONTRACT,
    status: ready ? "READY_FOR_APPROVAL" : "BLOCKED",
    ready_for_paid_generation: ready,
    organization_id,
    creative_mission_id,
    creative_project_id,
    lineage: canonical,
    research: researchReport ? {
      id: researchReport.id,
      title: researchReport.title || null,
      summary: researchReport.summary || null,
      confidence: Number(researchReport.confidence || 0),
      research_identity: researchReport.metadata?.research_identity || null,
      validation_passed: researchReport.metadata?.validation?.passed === true,
      verified_claim_count: list(researchReport.metadata?.claims)
        .filter((claim) => claim?.verified === true).length,
      source_count: list(researchReport.metadata?.sources).length,
    } : null,
    strategy: strategy ? {
      id: strategy.id,
      title: strategy.title || null,
      objective: strategy.objective || null,
      creative_angle: strategy.creative_angle || null,
      core_message: strategy.core_message || null,
      story_direction: strategy.story_direction || null,
    } : null,
    concept: concept ? {
      id: concept.id,
      title: concept.title || null,
      hook: concept.hook || null,
      message: concept.message || null,
      narrative: concept.narrative || null,
    } : null,
    storyboard: storyboard ? {
      id: storyboard.id,
      title: storyboard.title || null,
      synopsis: storyboard.synopsis || null,
      total_duration: Number(storyboard.total_duration || 0),
    } : null,
    scenes: scenePreview,
    shots: shotPreview,
    production_graph: graph ? {
      id: graph.id,
      status: graph.status,
      title: graph.title || null,
      node_count: list(graph.nodes).length,
      generated_media_perceptual_review_count:
        Number(graph.metadata?.generated_media_perceptual_review_count || 0),
    } : null,
    production_tasks: taskPreview,
    blocking_reasons: blockingReasons,
    provider_calls_executed: false,
    paid_reasoning_executed: false,
    perceptual_review_executed: false,
    publication_authorized: false,
    inspected_at: new Date().toISOString(),
  };
}

export const CreativePipelinePreviewRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildCreativePipelinePreview,
});
