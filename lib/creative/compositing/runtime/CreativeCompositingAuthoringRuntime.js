import {
  CreativeCompositingRuntime,
} from "@/lib/creative/compositing/runtime/CreativeCompositingRuntime";

const CONTRACT = "AVANTIQO_COMPOSITING_AUTHORING_V1";

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

function sceneFor(shot = {}, scenes = []) {
  return list(scenes).find((scene) => text(scene.id) === text(shot.scene_id)) || {};
}

function hasStructured(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(object(value)).length > 0;
}

function autoMultipassLayers(shot = {}, compositing = null) {
  const strategy = object(shot.generation_strategy);
  const passPolicy = object(strategy.pass_policy);
  const source = hasStructured(compositing)
    ? (Array.isArray(compositing) ? [...compositing] : list(compositing.layers))
    : [];
  const roles = new Set(source.map((layer) => text(layer.layer_role || layer.role).toUpperCase()));
  if (passPolicy.separate_threat_or_hero_layer_required === true && !roles.has("VFX_ELEMENT")) {
    source.push({
      layer_id: "auto-threat-hero-layer",
      layer_role: "VFX_ELEMENT",
      production_task_id: "AUTO_MULTIPASS:THREAT_HERO_LAYER",
      z_index: 20,
      blend_mode: "NORMAL",
      alpha_mode: "STRAIGHT",
      opacity: 1,
      occlusion_authority: "Governed depth map and pursuit spatial choreography define foreground/background ordering.",
      edge_treatment: "Preserve source alpha; reject halo, chatter, spill or silhouette mutation.",
      color_light_match: "Match base-plate exposure and let downstream physical-interaction pass author contact light/shadow/reflection.",
      motion_blur_dof_match: "Match authored shutter, lens, focus plane and threat velocity.",
      grain_texture_match: "Match base-plate temporal texture after threat integration.",
    });
  }
  if (passPolicy.separate_atmosphere_layer_required === true && !roles.has("ATMOSPHERE")) {
    source.push({
      layer_id: "auto-atmosphere-layer",
      layer_role: "ATMOSPHERE",
      production_task_id: "AUTO_MULTIPASS:ATMOSPHERE",
      z_index: 30,
      blend_mode: "NORMAL",
      alpha_mode: "STRAIGHT",
      opacity: 1,
      occlusion_authority: "Atmosphere follows authored scene depth and continuity state; foreground density may not reset at cuts.",
      edge_treatment: "Transparent atmosphere has no hard matte edges; reject banding, popping or detached volumetrics.",
      color_light_match: "Atmosphere inherits base exposure, white balance and practical/lightning response.",
      motion_blur_dof_match: "Rain streak and fog motion obey authored shutter, wind and camera movement.",
      grain_texture_match: "Atmosphere layer must preserve final temporal texture and may not introduce independent digital noise.",
    });
  }
  return source.length ? { layers: source } : compositing;
}

function authorShot(shot = {}, scene = {}) {
  const baseCompositing = hasStructured(shot.compositing)
    ? shot.compositing
    : scene.compositing || null;
  const compositing = autoMultipassLayers(shot, baseCompositing);
  const result = CreativeCompositingRuntime.author({
    ...shot,
    compositing,
    execution_phase: "PRODUCTION_GRAPH_AUTHORING",
  });

  if (result.status === "BLOCKED") {
    const codes = result.blocking_issues.map((item) => item.code).join(",");
    throw new Error(
      `CREATIVE_COMPOSITING_AUTHORING_BLOCKED:${text(shot.id) || "unknown"}:${codes}`,
    );
  }
  if (result.status !== "READY") return shot;

  return {
    ...shot,
    compositing_contract: result.compositing_contract,
    metadata: {
      ...object(shot.metadata),
      compositing_contract: result.contract,
      compositing_status: result.status,
      compositing_layer_count: result.compositing_contract?.layers?.length || 0,
      compositing_contract_hash: result.compositing_contract?.contract_hash || null,
      compositing_authored_before_materialization: true,
      compositing_provider_neutral: true,
      compositing_provider_prompt_persisted: false,
    },
  };
}

export function buildCreativeCompositingContracts({
  scenes = [],
  shots = [],
  creative_plan = {},
} = {}) {
  const enrichedShots = list(shots).map((shot) =>
    authorShot(shot, sceneFor(shot, scenes)),
  );
  const readyShots = enrichedShots.filter(
    (shot) => shot.metadata?.compositing_status === "READY",
  );
  return {
    scenes,
    shots: enrichedShots,
    creative_plan,
    metadata: {
      compositing_authoring_contract: CONTRACT,
      compositing_runtime_contract: CreativeCompositingRuntime.contract,
      compositing_ready_shot_count: readyShots.length,
      compositing_layer_count: readyShots.reduce(
        (sum, shot) => sum + Number(shot.metadata?.compositing_layer_count || 0),
        0,
      ),
      compositing_provider_neutral: true,
      compositing_authored_before_materialization: true,
      compositing_execution_authorship_forbidden: true,
    },
  };
}

export const CreativeCompositingAuthoringRuntime = Object.freeze({
  build: buildCreativeCompositingContracts,
  contract: CONTRACT,
  compositing_contract: CreativeCompositingRuntime.contract,
  execution_authorship_forbidden: true,
  provider_neutral: true,
});
