import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_WORLD_CONSISTENCY_V1";

const LOCKED_DIMENSIONS = Object.freeze([
  "location_identity",
  "spatial_geography",
  "architecture_geometry",
  "production_design",
  "props_set_dressing",
  "materials_surfaces",
  "signage_readable_text",
  "lighting_sources_direction",
  "time_of_day",
  "weather",
  "atmosphere",
  "background_population",
  "scale_perspective",
]);

const GENERIC_WORLD = /^(?:location|environment|interior|exterior|room|building|office|restaurant|bar|street|city|cinematic|realistic|premium|world[- ]class)$/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 5000) {
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

function hasData(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(text(value));
}

function firstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && !value.length) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value ?? null))).digest("hex");
}

function bounded(value, depth = 0) {
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => bounded(item, depth + 1));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 1600) : value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 40)
      .map(([key, child]) => [key, bounded(child, depth + 1)]),
  );
}

function issue(code, field, message, severity = "blocking") {
  return { code, field, message, severity };
}

function normalizeReferenceAsset(value) {
  if (typeof value === "string") return { asset_id: text(value, 500), role: "WORLD_REFERENCE" };
  const candidate = object(value);
  const assetId = text(
    candidate.asset_node_id ||
    candidate.asset_id ||
    candidate.id ||
    candidate.reference_asset_id,
    500,
  );
  if (!assetId) return null;
  return {
    asset_id: assetId,
    role: text(candidate.role || candidate.reference_role || "WORLD_REFERENCE", 300).toUpperCase(),
    description: text(candidate.description || candidate.label, 1200) || null,
  };
}

function worldReferences(scene = {}, shot = {}) {
  const sceneWorld = object(scene.world);
  const shotWorld = object(shot.world);
  return [
    ...list(scene.world_reference_assets || sceneWorld.reference_assets),
    ...list(shot.world_reference_assets || shotWorld.reference_assets),
    ...list(scene.reference_assets).filter((item) => /WORLD|ENVIRONMENT|LOCATION|SET|ARCHITECTURE/i.test(text(item?.role))),
    ...list(shot.reference_assets).filter((item) => /WORLD|ENVIRONMENT|LOCATION|SET|ARCHITECTURE/i.test(text(item?.role))),
  ].map(normalizeReferenceAsset).filter(Boolean);
}

function propsFrom(value = {}) {
  const source = object(value);
  return list(
    source.props ||
    source.set_dressing ||
    source.setDressing ||
    source.environment_props,
  );
}

function worldState(value = {}) {
  const source = object(value);
  const world = object(source.world);
  const metadata = object(source.metadata);
  const metadataWorld = object(metadata.world);
  return bounded({
    location: firstValue(world.location, source.location, metadataWorld.location),
    spatial_geography: firstValue(
      world.spatial_geography,
      world.geography,
      source.spatial_geography,
      source.geography,
      metadataWorld.spatial_geography,
      metadataWorld.geography,
    ),
    architecture_geometry: firstValue(
      world.architecture_geometry,
      world.architecture,
      source.architecture_geometry,
      source.architecture,
      metadataWorld.architecture_geometry,
      metadataWorld.architecture,
    ),
    production_design: firstValue(
      world.production_design,
      source.production_design,
      metadataWorld.production_design,
    ),
    props_set_dressing: [
      ...propsFrom(world),
      ...propsFrom(source),
      ...propsFrom(metadataWorld),
    ],
    materials_surfaces: firstValue(
      world.materials_surfaces,
      world.materials,
      source.materials_surfaces,
      source.materials,
      metadataWorld.materials_surfaces,
      metadataWorld.materials,
    ),
    signage_readable_text: firstValue(
      world.signage_readable_text,
      world.signage,
      source.signage_readable_text,
      source.signage,
      metadataWorld.signage_readable_text,
      metadataWorld.signage,
    ),
    lighting_sources_direction: firstValue(
      world.lighting_sources_direction,
      world.lighting,
      source.lighting,
      metadataWorld.lighting_sources_direction,
      metadataWorld.lighting,
    ),
    time_of_day: firstValue(
      world.time_of_day,
      source.time_of_day,
      source.timeOfDay,
      metadataWorld.time_of_day,
    ),
    weather: firstValue(world.weather, source.weather, metadataWorld.weather),
    atmosphere: firstValue(world.atmosphere, source.atmosphere, metadataWorld.atmosphere),
    background_population: firstValue(
      world.background_population,
      world.background_activity,
      source.background_population,
      source.background_activity,
      metadataWorld.background_population,
    ),
    scale_perspective: firstValue(
      world.scale_perspective,
      world.scene_scale,
      source.scale_perspective,
      source.scene_scale,
      metadataWorld.scale_perspective,
      "Preserve coherent real-world scale, lens-relative perspective and object-to-architecture proportions across every shot in this world.",
    ),
  });
}

function worldIdentity(scene = {}, shot = {}) {
  const sceneWorld = object(scene.world);
  const shotWorld = object(shot.world);
  const sceneLocation = object(scene.location);
  const shotLocation = object(shot.location);
  return text(firstValue(
    shot.world_id,
    shotWorld.world_id,
    scene.world_id,
    sceneWorld.world_id,
    shotLocation.location_id,
    shotLocation.id,
    sceneLocation.location_id,
    sceneLocation.id,
    scene.id ? `scene:${scene.id}` : null,
    shot.scene_id ? `scene:${shot.scene_id}` : null,
  ), 800);
}

function primitive(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function contradictions(base, candidate, path = "world") {
  if (!hasData(base) || !hasData(candidate)) return [];
  if (primitive(base) || primitive(candidate)) {
    return text(base, 2000) === text(candidate, 2000)
      ? []
      : [{ path, base: bounded(base), candidate: bounded(candidate) }];
  }
  if (Array.isArray(base) || Array.isArray(candidate)) return [];
  const left = object(base);
  const right = object(candidate);
  const conflicts = [];
  for (const key of Object.keys(right)) {
    if (!Object.prototype.hasOwnProperty.call(left, key)) continue;
    conflicts.push(...contradictions(left[key], right[key], `${path}.${key}`));
  }
  return conflicts;
}

function explicitOverride(shot = {}) {
  const continuity = object(shot.continuity);
  const override = object(
    shot.world_override ||
    shot.world?.override ||
    continuity.world_override,
  );
  const requested = hasData(override) ||
    continuity.world_change === true ||
    continuity.continuity_reset === true ||
    continuity.reset === true;
  const reason = text(firstValue(
    override.reason,
    override.change_reason,
    continuity.world_change_reason,
    continuity.continuity_reset_reason,
    continuity.reset_reason,
    continuity.change_reason,
  ), 1600);
  return {
    requested,
    authorized: requested && reason.length >= 12,
    reason: reason || null,
    override,
  };
}

function author(input = {}) {
  const shot = object(input.shot || input);
  const scene = object(input.scene);
  const existing = object(
    input.world_consistency_contract ||
    shot.world_consistency_contract ||
    shot.requirements?.world_consistency_contract,
  );
  if (Object.keys(existing).length) return verify({ world_consistency_contract: existing });
  const worldId = worldIdentity(scene, shot);
  const sceneBase = worldState(scene);
  const shotState = worldState(shot);
  const override = explicitOverride(shot);
  const conflicts = contradictions(sceneBase, shotState);
  const blockers = [];
  const warnings = [];

  if (!worldId) {
    blockers.push(issue("WORLD_ID_REQUIRED", "world_id", "Every cinematic shot must resolve to a stable world/location identity before generation."));
  }
  if (override.requested && !override.authorized) {
    blockers.push(issue("WORLD_CHANGE_REASON_REQUIRED", "world_override.reason", "A world-state change requires an explicit reason so approved geography is never silently rewritten."));
  }
  if (conflicts.length && !override.authorized) {
    blockers.push(issue("WORLD_UNAUTHORIZED_BASE_CONTRADICTION", "world_state", "Shot-level world state contradicts the scene base without an authorized world change."));
  }
  const locationText = text(firstValue(shotState.location, sceneBase.location), 1200);
  if (locationText && GENERIC_WORLD.test(locationText)) {
    warnings.push(issue("WORLD_LOCATION_ANCHOR_GENERIC", "location", "The location anchor is generic; reviewed visual state will become the stronger authority after the first approved shot.", "warning"));
  }

  const contractBase = {
    contract: CONTRACT,
    version: 1,
    provider_neutral: true,
    provider_prompt_persisted: false,
    execution_authored: false,
    shot_id: shot.id || null,
    scene_id: shot.scene_id || scene.id || null,
    world_id: worldId || null,
    composition_model: "SCENE_BASE_PLUS_SPARSE_SHOT_OVERRIDE",
    scene_base_state: sceneBase,
    shot_planned_state: shotState,
    explicit_world_change: {
      requested: override.requested,
      authorized: override.authorized,
      reason: override.reason,
      override: bounded(override.override),
    },
    base_contradictions: conflicts,
    locked_dimensions: LOCKED_DIMENSIONS,
    world_reference_assets: worldReferences(scene, shot),
    policy: {
      reviewed_rendered_state_becomes_authoritative_for_later_shots: true,
      no_silent_architecture_or_geography_mutation: true,
      no_prop_or_set_dressing_teleportation: true,
      no_unmotivated_time_weather_or_lighting_reset: true,
      readable_signage_and_brand_text_must_not_drift: true,
      reflections_shadows_and_occlusion_must_match_world_geometry: true,
      camera_angle_may_change_world_geometry_may_not: true,
      stronger_shot_override_requires_explicit_authority: true,
      generated_attractiveness_cannot_override_world_failure: true,
    },
  };
  const worldContract = {
    ...contractBase,
    contract_hash: hash(contractBase),
  };
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    world_consistency_contract: worldContract,
    blocking_issues: blockers,
    warnings,
  };
}

function verify(input = {}) {
  const existing = object(
    input.world_consistency_contract ||
    input.requirements?.world_consistency_contract ||
    input.metadata?.world_consistency_contract_data,
  );
  if (!Object.keys(existing).length) {
    return {
      contract: CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE",
      world_consistency_contract: null,
      blocking_issues: [],
      warnings: [],
    };
  }
  const blockers = [];
  if (text(existing.contract, 300) !== CONTRACT) {
    blockers.push(issue("WORLD_CONTRACT_INVALID", "contract", `Expected ${CONTRACT}.`));
  }
  if (!text(existing.world_id, 800)) {
    blockers.push(issue("WORLD_ID_REQUIRED", "world_id", "World contract requires stable world identity."));
  }
  if (!list(existing.locked_dimensions).length) {
    blockers.push(issue("WORLD_LOCKED_DIMENSIONS_REQUIRED", "locked_dimensions", "World contract requires explicit locked continuity dimensions."));
  }
  if (existing.explicit_world_change?.requested === true && existing.explicit_world_change?.authorized !== true) {
    blockers.push(issue("WORLD_CHANGE_REASON_REQUIRED", "explicit_world_change", "Requested world-state change is not authorized."));
  }
  if (list(existing.base_contradictions).length && existing.explicit_world_change?.authorized !== true) {
    blockers.push(issue("WORLD_UNAUTHORIZED_BASE_CONTRADICTION", "base_contradictions", "Unresolved scene/shot world contradictions remain."));
  }
  const expectedHash = text(existing.contract_hash, 300);
  const hashSource = { ...existing };
  delete hashSource.contract_hash;
  if (!expectedHash || expectedHash !== hash(hashSource)) {
    blockers.push(issue("WORLD_CONTRACT_HASH_MISMATCH", "contract_hash", "World contract hash must match the exact authored world state."));
  }
  return {
    contract: CONTRACT,
    applicable: true,
    status: blockers.length ? "BLOCKED" : "READY",
    world_consistency_contract: existing,
    blocking_issues: blockers,
    warnings: [],
  };
}

function assertReady(input = {}) {
  const result = verify(input);
  if (!result.applicable) {
    throw new Error("CREATIVE_WORLD_PREAUTHORED_CONTRACT_REQUIRED");
  }
  if (result.status !== "READY") {
    throw new Error(`CREATIVE_WORLD_NOT_READY:${result.blocking_issues.map((item) => item.code).join(",")}`);
  }
  return result;
}

export const CreativeWorldConsistencyRuntime = Object.freeze({
  contract: CONTRACT,
  lockedDimensions: LOCKED_DIMENSIONS,
  author,
  verify,
  assertReady,
  provider_neutral: true,
  provider_prompt_persisted: false,
  execution_authorship_forbidden: true,
});

export const AVANTIQO_WORLD_CONSISTENCY_CONTRACT = CONTRACT;
