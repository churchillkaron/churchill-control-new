import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_COMPOSITING_V1";

const LAYER_ROLES = Object.freeze([
  "BASE_PLATE",
  "SET_EXTENSION",
  "SIMULATION_PASS",
  "VFX_ELEMENT",
  "SCREEN_INSERT",
  "FOREGROUND_HOLDOUT",
  "ATMOSPHERE",
  "LIGHTING_PASS",
  "BEAUTY_CLEANUP",
  "GRAPHIC_ELEMENT",
]);

const BLEND_MODES = Object.freeze([
  "NORMAL",
  "ADD",
  "SCREEN",
  "MULTIPLY",
  "OVERLAY",
  "LIGHTEN",
  "DARKEN",
]);

const ALPHA_MODES = Object.freeze([
  "OPAQUE",
  "STRAIGHT",
  "LUMA_MATTE",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 4000) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().slice(0, limit);
  }
  if (!value) return "";
  try {
    return JSON.stringify(value).slice(0, limit);
  } catch {
    return "";
  }
}

function upper(value) {
  return text(value, 300).toUpperCase().replace(/[ -]+/g, "_");
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function issue(code, field, message, severity = "blocking") {
  return { code, field, message, severity };
}

function enabled(value) {
  const candidate = object(value);
  return !(
    candidate.enabled === false ||
    candidate.required === false ||
    candidate.applicable === false
  );
}

function source(input = {}) {
  const requirements = object(input.requirements);
  const metadata = object(input.metadata);
  return {
    existing: object(
      input.compositing_contract ||
      requirements.compositing_contract ||
      metadata.compositing_contract_data,
    ),
    compositing:
      input.compositing ??
      requirements.compositing ??
      metadata.compositing ??
      null,
    shot_id: text(input.shot_id || input.id || metadata.shot_id, 500) || null,
    vfx_contract: object(input.vfx_contract || requirements.vfx_contract || metadata.vfx_contract_data),
    simulation_contract: object(input.simulation_contract || requirements.simulation_contract || metadata.simulation_contract_data),
    continuity: object(input.continuity || requirements.continuity || metadata.continuity),
  };
}

function entries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(object).filter(enabled);
  const candidate = object(value);
  if (!enabled(candidate)) return [];
  if (Array.isArray(candidate.layers)) {
    return candidate.layers.filter(Boolean).map(object).filter(enabled);
  }
  return Object.keys(candidate).length ? [candidate] : [];
}

function normalizeLayer(layer = {}, index = 0) {
  const role = upper(layer.role || layer.layer_role || layer.type) || "VFX_ELEMENT";
  const blend = upper(layer.blend_mode || layer.blend || "NORMAL");
  const alpha = upper(layer.alpha_mode || layer.alpha || (layer.matte_asset_node_id ? "LUMA_MATTE" : "STRAIGHT"));
  const transform = object(layer.transform);
  const timing = object(layer.timing);
  return {
    layer_id: text(layer.layer_id || layer.id, 300) || `layer-${index + 1}`,
    layer_role: role,
    asset_node_id: text(layer.asset_node_id || layer.assetNodeId, 500) || null,
    production_task_id: text(layer.production_task_id || layer.productionTaskId, 500) || null,
    matte_asset_node_id: text(layer.matte_asset_node_id || layer.matteAssetNodeId, 500) || null,
    z_index: finite(layer.z_index ?? layer.zIndex, index + 1),
    blend_mode: blend,
    alpha_mode: alpha,
    opacity: Math.max(0, Math.min(1, finite(layer.opacity, 1))),
    transform: {
      x: finite(transform.x ?? layer.x, 0),
      y: finite(transform.y ?? layer.y, 0),
      width: finite(transform.width ?? layer.width, null),
      height: finite(transform.height ?? layer.height, null),
      scale_mode: upper(transform.scale_mode || layer.scale_mode || "FIT"),
    },
    timing: {
      source_in_seconds: Math.max(0, finite(timing.source_in_seconds ?? layer.source_in_seconds, 0)),
      timeline_in_seconds: Math.max(0, finite(timing.timeline_in_seconds ?? layer.timeline_in_seconds, 0)),
      duration_seconds: finite(timing.duration_seconds ?? layer.duration_seconds, null),
    },
    tracking_authority: text(layer.tracking_authority || layer.tracking, 1600) || null,
    perspective_authority: text(layer.perspective_authority || layer.perspective, 1600) || null,
    occlusion_authority: text(layer.occlusion_authority || layer.occlusion, 1600) || null,
    edge_treatment: text(layer.edge_treatment || layer.edge_integration, 1600) || null,
    color_light_match: text(layer.color_light_match || layer.color_exposure_match, 1600) || null,
    motion_blur_dof_match: text(layer.motion_blur_dof_match || layer.motion_blur, 1600) || null,
    grain_texture_match: text(layer.grain_texture_match || layer.grain_match, 1600) || null,
  };
}

function evaluateLayer(layer = {}, index = 0) {
  const blockers = [];
  if (!LAYER_ROLES.includes(layer.layer_role)) {
    blockers.push(issue("COMPOSITING_LAYER_ROLE_INVALID", `layers.${index}.layer_role`, "Layer role must be a governed compositing role."));
  }
  if (!layer.asset_node_id && !layer.production_task_id) {
    blockers.push(issue("COMPOSITING_LAYER_SOURCE_REQUIRED", `layers.${index}`, "Every layer requires an asset node or production task source."));
  }
  if (!BLEND_MODES.includes(layer.blend_mode)) {
    blockers.push(issue("COMPOSITING_BLEND_MODE_INVALID", `layers.${index}.blend_mode`, "Blend mode is not supported by the governed renderer."));
  }
  if (!ALPHA_MODES.includes(layer.alpha_mode)) {
    blockers.push(issue("COMPOSITING_ALPHA_MODE_INVALID", `layers.${index}.alpha_mode`, "Alpha mode must be OPAQUE, STRAIGHT or LUMA_MATTE."));
  }
  if (layer.alpha_mode === "LUMA_MATTE" && !layer.matte_asset_node_id) {
    blockers.push(issue("COMPOSITING_MATTE_REQUIRED", `layers.${index}.matte_asset_node_id`, "Luma-matte compositing requires a governed matte asset."));
  }
  if (layer.layer_role !== "BASE_PLATE") {
    if (!layer.edge_treatment) blockers.push(issue("COMPOSITING_EDGE_TREATMENT_REQUIRED", `layers.${index}.edge_treatment`, "Non-base layers require explicit edge/alpha integration."));
    if (!layer.color_light_match) blockers.push(issue("COMPOSITING_COLOR_LIGHT_MATCH_REQUIRED", `layers.${index}.color_light_match`, "Non-base layers require color/exposure/light matching."));
    if (!layer.motion_blur_dof_match) blockers.push(issue("COMPOSITING_BLUR_DOF_MATCH_REQUIRED", `layers.${index}.motion_blur_dof_match`, "Non-base layers require motion-blur and depth-of-field matching."));
    if (!layer.grain_texture_match) blockers.push(issue("COMPOSITING_GRAIN_MATCH_REQUIRED", `layers.${index}.grain_texture_match`, "Non-base layers require grain/texture matching."));
    if (!layer.occlusion_authority) blockers.push(issue("COMPOSITING_OCCLUSION_AUTHORITY_REQUIRED", `layers.${index}.occlusion_authority`, "Non-base layers require foreground/background occlusion authority."));
  }
  return blockers;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function author(input = {}) {
  const src = source(input);
  if (Object.keys(src.existing).length) return verify(input);
  const requested = entries(src.compositing);
  if (!requested.length) {
    return {
      contract: CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE",
      compositing_contract: null,
      blocking_issues: [],
    };
  }

  let layers = requested.map(normalizeLayer);
  if (!layers.some((layer) => layer.layer_role === "BASE_PLATE")) {
    layers = [{
      layer_id: "base-plate-selected-candidate",
      layer_role: "BASE_PLATE",
      asset_node_id: null,
      production_task_id: null,
      matte_asset_node_id: null,
      z_index: 0,
      blend_mode: "NORMAL",
      alpha_mode: "OPAQUE",
      opacity: 1,
      transform: { x: 0, y: 0, width: null, height: null, scale_mode: "COVER" },
      timing: { source_in_seconds: 0, timeline_in_seconds: 0, duration_seconds: null },
      tracking_authority: "Base plate is the selected world-class shot candidate and defines camera motion authority.",
      perspective_authority: "Base plate defines perspective and image-space geometry authority.",
      occlusion_authority: "Base plate depth and governed mattes define occlusion authority.",
      edge_treatment: "Base plate does not require alpha edge treatment.",
      color_light_match: "Base plate defines shot color and lighting reference.",
      motion_blur_dof_match: "Base plate defines motion blur and depth-of-field reference.",
      grain_texture_match: "Base plate defines grain and texture reference.",
      auto_resolved_selected_candidate: true,
    }, ...layers];
  }
  layers = [...layers].sort((a, b) => a.z_index - b.z_index);
  const blockers = layers.flatMap((layer, index) => evaluateLayer(layer, index));
  if (layers.filter((layer) => layer.layer_role === "BASE_PLATE").length !== 1) {
    blockers.push(issue("COMPOSITING_SINGLE_BASE_PLATE_REQUIRED", "layers", "Exactly one base plate must define the shot's image-space authority."));
  }

  const contract = {
    contract: CONTRACT,
    version: 1,
    shot_id: src.shot_id,
    provider_neutral: true,
    provider_prompt_persisted: false,
    execution_authored: false,
    layers,
    source_vfx_contract: text(src.vfx_contract.contract, 300) || null,
    source_simulation_contract: text(src.simulation_contract.contract, 300) || null,
    render_order: layers.map((layer) => layer.layer_id),
    alpha_policy: "STRAIGHT_ALPHA_INTERNAL_PREMULTIPLY_ONLY_AT_MERGE_BOUNDARY",
    linear_light_policy: "COLOR_MANAGEMENT_MUST_BE_EXPLICIT_AT_RENDER_BACKEND",
    hidden_layer_mutation_forbidden: true,
    aggregate_beauty_cannot_override_edge_tracking_identity_or_geometry_failure: true,
    continuity_preserved: true,
  };
  contract.contract_hash = hash(contract);
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    compositing_contract: contract,
    blocking_issues: blockers,
  };
}

function verify(input = {}) {
  const src = source(input);
  const existing = src.existing;
  if (!Object.keys(existing).length) {
    if (!entries(src.compositing).length) {
      return { contract: CONTRACT, applicable: false, status: "NOT_APPLICABLE", compositing_contract: null, blocking_issues: [] };
    }
    return {
      contract: CONTRACT,
      applicable: true,
      status: "BLOCKED",
      compositing_contract: null,
      blocking_issues: [issue("COMPOSITING_PREAUTHORED_CONTRACT_REQUIRED", "compositing_contract", "Compositing must be authored before mastering; render-time authorship is forbidden.")],
    };
  }
  const blockers = [];
  if (text(existing.contract, 300) !== CONTRACT) blockers.push(issue("COMPOSITING_CONTRACT_INVALID", "contract", `Expected ${CONTRACT}.`));
  const layers = list(existing.layers);
  if (!layers.length) blockers.push(issue("COMPOSITING_LAYERS_REQUIRED", "layers", "An applicable compositing contract requires layers."));
  if (layers.filter((layer) => layer.layer_role === "BASE_PLATE").length !== 1) blockers.push(issue("COMPOSITING_SINGLE_BASE_PLATE_REQUIRED", "layers", "Exactly one base plate is required."));
  layers.forEach((layer, index) => blockers.push(...evaluateLayer(layer, index)));
  const expectedHash = existing.contract_hash;
  if (!expectedHash) blockers.push(issue("COMPOSITING_CONTRACT_HASH_REQUIRED", "contract_hash", "Compositing contract requires a stable hash."));
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    compositing_contract: existing,
    blocking_issues: blockers,
  };
}

export const CreativeCompositingRuntime = Object.freeze({
  contract: CONTRACT,
  layerRoles: LAYER_ROLES,
  blendModes: BLEND_MODES,
  alphaModes: ALPHA_MODES,
  author,
  verify,
  provider_neutral: true,
  provider_prompt_persisted: false,
  execution_authorship_forbidden: true,
});
