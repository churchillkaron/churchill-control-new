const CONTRACT = "CREATIVE_SHOT_PHYSICAL_WORLD_V1";
const MATERIAL_CONTRACT = "CREATIVE_SHOT_MATERIAL_PHYSICS_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function unique(values = []) { return [...new Set(values.flat().map(text).filter(Boolean))]; }

function first(...values) {
  for (const value of values) {
    if (typeof value === "string" && text(value)) return text(value);
    if (value && typeof value === "object" && Object.keys(value).length) return value;
  }
  return null;
}

function productionBible(plan = {}) {
  return object(plan.production?.production_design_bible || plan.production_design_bible);
}
function materialBible(plan = {}) {
  return object(plan.production?.material_physics || plan.material_physics);
}
function lightingBible(plan = {}) {
  return object(plan.production?.lighting_simulation || plan.lighting_simulation);
}
function surfaceRules(shot = {}, bible = {}, material = {}) {
  const design = object(shot.production_design);
  return {
    architecture: first(design.architecture, design.environment, bible.environment_continuity) || "Architecture must remain specific to the authored location and physically coherent across the shot.",
    floor: first(design.floor, design.floor_material, design.materials) || "Floor material must have believable scale, roughness, contact and wear.",
    walls: first(design.walls, design.wall_material, design.materials) || "Walls must retain location-specific construction, finish, age and surface variation.",
    glass: first(design.glass, material.material_library) || "Glass must preserve thickness, Fresnel reflection, refraction, occlusion and physically coherent highlights.",
    metal: first(design.metal, material.material_library) || "Metal must preserve authored finish, roughness, edge highlights, reflections, weight and contact.",
    wood: first(design.wood, material.material_library) || "Wood must preserve grain scale, finish, age, edge wear and non-plastic response.",
    cloth_hair: first(design.cloth_hair, material.cloth_hair_behavior) || "Cloth and hair obey attachment, gravity, inertia, drag, collision and authored wind.",
    fluids_particulates: first(design.fluids, material.fluid_particulate_behavior) || "Water, mist, smoke, spray and particles preserve source, scale, gravity, advection, contact and continuity.",
  };
}

function physicalResponses(shot = {}, material = {}) {
  return {
    light_response: text(shot.material_behavior) || "Every visible material preserves distinct roughness, specularity, translucency and shadow response under the authored light.",
    motion_response: text(shot.mechanical_truth) || "Mass, inertia, acceleration, drag, attachments and secondary motion remain causally plausible.",
    contact_response: first(material.contact_deformation, shot.production_design?.contact_deformation) || "Contacts create plausible support, collision, compression, deformation or displacement without interpenetration.",
    weather_response: first(material.weather_behavior, shot.production_design?.weather_behavior) || "Weather affects exposed surfaces, atmosphere and motion continuously rather than resetting between frames.",
    reflection_response: "Reflections remain viewpoint-, geometry- and light-consistent; no crawling, duplicated, detached or impossible reflected objects.",
    refraction_response: "Transparent and refractive surfaces preserve stable geometry, thickness and background distortion appropriate to the material.",
    weight_response: "Objects and bodies communicate believable mass through support, inertia, settling, deformation and collision response.",
  };
}
export function buildShotPhysicalWorld({ shot = {}, creative_plan = {} } = {}) {
  const design = object(shot.production_design);
  const bible = productionBible(creative_plan);
  const material = materialBible(creative_plan);
  const lighting = lightingBible(creative_plan);
  return Object.freeze({
    contract: CONTRACT,
    version: 1,
    production_design: {
      architecture: first(design.architecture, design.environment),
      materials: first(design.materials, material.material_library),
      surface_age: first(design.surface_age, design.surface_aging, bible.surface_aging_rules),
      floor: first(design.floor, design.floor_material),
      walls: first(design.walls, design.wall_material),
      glass: first(design.glass, material.material_library),
      metal: first(design.metal, material.material_library),
      furniture: first(design.furniture, bible.set_dressing_bible),
      machines: first(design.machines, design.machinery, shot.mechanical_signature),
      wear_dirt: first(design.wear_dirt, design.texture_detail, bible.surface_aging_rules),
      reflections: first(design.reflections, lighting.reflection_map),
      weather_effects: first(design.weather_effects, material.weather_behavior),
      practical_lights: first(design.practical_lights, lighting.motivated_light_map),
      background_activity: first(design.background_activity, design.environment),
      human_density: first(design.human_density, design.crowd_density) || "Only the authored human density is allowed; no decorative crowd filling.",
      wardrobe_palette: first(design.wardrobe_palette, bible.wardrobe_bible),
      prop_hierarchy: first(design.prop_hierarchy, design.props, bible.props_bible),
    },
    material_physics: {
      contract: MATERIAL_CONTRACT,
      surfaces: surfaceRules(shot, bible, material),
      responses: physicalResponses(shot, material),
      aggregate_beauty_cannot_override_material_or_physics_failure: true,
      synthetic_uniform_surface_response_forbidden: true,
    },
    source_bibles: { production_design_bible: bible, material_physics: material, lighting_simulation: lighting },
    release_blocking: true,
  });
}
export function evaluateShotPhysicalWorld(value = {}) {
  const failures = [];
  if (value.contract !== CONTRACT) failures.push("SHOT_PHYSICAL_WORLD_CONTRACT_REQUIRED");
  if (value.material_physics?.contract !== MATERIAL_CONTRACT) failures.push("SHOT_MATERIAL_PHYSICS_CONTRACT_REQUIRED");
  const design = object(value.production_design);
  const requiredDesign = ["architecture", "materials", "surface_age", "wear_dirt", "reflections", "practical_lights", "background_activity", "human_density", "prop_hierarchy"];
  for (const field of requiredDesign) if (!text(design[field]) && !Object.keys(object(design[field])).length) failures.push(`SHOT_PRODUCTION_DESIGN_FIELD_REQUIRED:${field}`);
  const surfaces = object(value.material_physics?.surfaces);
  for (const field of ["floor", "walls", "glass", "metal", "wood", "cloth_hair", "fluids_particulates"]) if (!text(surfaces[field]) && !Object.keys(object(surfaces[field])).length) failures.push(`SHOT_MATERIAL_SURFACE_REQUIRED:${field}`);
  const responses = object(value.material_physics?.responses);
  for (const field of ["light_response", "motion_response", "contact_response", "weather_response", "reflection_response", "refraction_response", "weight_response"]) if (!text(responses[field])) failures.push(`SHOT_MATERIAL_RESPONSE_REQUIRED:${field}`);
  if (value.release_blocking !== true) failures.push("SHOT_PHYSICAL_WORLD_RELEASE_BLOCKING_REQUIRED");
  return Object.freeze({ contract: "CREATIVE_SHOT_PHYSICAL_WORLD_GATE_V1", passed: failures.length === 0, failures });
}

export const CreativeShotPhysicalWorldRuntime = Object.freeze({
  contract: CONTRACT,
  material_contract: MATERIAL_CONTRACT,
  build: buildShotPhysicalWorld,
  evaluate: evaluateShotPhysicalWorld,
});
