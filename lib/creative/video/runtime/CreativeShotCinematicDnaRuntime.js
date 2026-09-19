const CONTRACT = "CREATIVE_SHOT_CINEMATIC_DNA_V1";
const QUALITY_FLOOR = 94;

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function unique(values = []) { return [...new Set(values.flat().map(text).filter(Boolean))]; }

function benchmarkLab(plan = {}) {
  return object(plan.benchmark_lab || plan.production?.benchmark_lab || plan.creative_grounding?.benchmark_lab);
}
function benchmarkPrinciples(plan = {}) {
  const dna = object(benchmarkLab(plan).craft_dna);
  return unique([
    list(dna.transferable_principles).slice(0, 4),
    list(dna.cinematography_principles).slice(0, 2),
    list(dna.editorial_principles).slice(0, 2),
    list(dna.sound_principles).slice(0, 2),
  ]).slice(0, 8);
}
function scaleRole(shot = {}) {
  const source = lower(JSON.stringify({
    framing: shot.camera?.framing,
    lens: shot.camera?.lens_intent,
    platform: shot.camera?.platform,
    subject: shot.subject,
    purpose: shot.purpose,
    aerial: shot.aerial_cinematography,
  }));
  if (/extreme close|macro|insert|detail|micro/.test(source)) return "MICRO";
  if (/aerial|drone|helicopter|extreme wide|vast|landscape|cityscape|monumental/.test(source)) return "MONUMENTAL";
  if (/wide|environment|architecture|factory|venue|street|room/.test(source)) return "ENVIRONMENTAL";
  return "HUMAN";
}
function heroRequired(shot = {}) {
  const source = lower(JSON.stringify({
    reveal_stage: shot.reveal_stage,
    purpose: shot.purpose,
    title: shot.title,
    beauty: shot.cinematic_beauty_intent || shot.beauty_intent,
  }));
  return /hero|iconic|payoff|reveal|climax|signature|establish|awe/.test(source) || object(shot.cinematic_beauty_intent).hero_frame_required === true;
}
function visualHierarchy(shot = {}) {
  const beauty = object(shot.cinematic_beauty_intent || shot.beauty_intent);
  return text(beauty.composition) || text(shot.subject)
    ? `Primary attention stays on ${text(shot.subject) || "the authored subject"}; composition must preserve the authored story hierarchy and prevent decorative background detail from stealing focus.`
    : "Preserve one unambiguous primary visual subject and a readable hierarchy across foreground, midground and background.";
}
function depthStrategy(shot = {}) {
  const layers = shot.depth_layers;
  if (typeof layers === "string" && text(layers)) return text(layers);
  if (Array.isArray(layers) && layers.length) return unique(layers).join(" | ");
  if (layers && typeof layers === "object" && Object.keys(layers).length) return JSON.stringify(layers);
  return "Use motivated foreground, midground and background separation where physically available; avoid flat single-plane AI composition.";
}
function humanConsequence(shot = {}) {
  const explicit = text(shot.human_consequence || shot.human_purpose);
  if (explicit && explicit.toUpperCase() !== "NONE") return explicit;
  const action = text(shot.action || shot.performance || shot.performance_direction);
  return action
    ? `The authored human or subject action must visibly change the shot state: ${action}`
    : "If a person is visible, their behavior must be lived and consequential rather than posed, demonstrative or camera-aware.";
}
function placeCausality(shot = {}, scene = {}) {
  const grounding = object(shot.creative_grounding);
  const location = object(shot.location || scene.location);
  const explicit = text(grounding.why_here_not_anywhere || grounding.place_causality || shot.place_causality);
  if (explicit) return explicit;
  if (Object.keys(location).length) {
    return `The authored location must materially affect architecture, light, atmosphere, spatial behavior and physical action; it may not read as interchangeable location wallpaper. Location evidence: ${JSON.stringify(location)}`;
  }
  return "Environment must materially affect light, depth, material response and action; never use generic location wallpaper.";
}
function materialBehavior(shot = {}) {
  const explicit = shot.material_behavior || shot.mechanical_truth || shot.production_design?.material_behavior;
  if (explicit && (typeof explicit === "string" ? text(explicit) : Object.keys(object(explicit)).length)) return explicit;
  return "Materials, cloth, skin, glass, metal, water, smoke, vegetation, machinery and reflections must respond with physically plausible weight, inertia, contact, wind and light whenever present.";
}
function soundRole(shot = {}) {
  const audio = object(shot.audio || shot.sound_design);
  const sync = list(audio.sync_events);
  if (sync.length) return `Picture motion must honor these authored sound-synchronised events: ${sync.map((event) => typeof event === "string" ? event : JSON.stringify(event)).join(" | ")}`;
  return "Picture movement should create believable physical sound opportunities and preserve any authored silence, impact or transition cue rather than behaving as mute decorative motion.";
}
function cameraPhilosophy(shot = {}) {
  const camera = object(shot.camera);
  const movement = text(camera.movement_path || camera.movement);
  const motivation = text(camera.platform_motivation || camera.movement_motivation);
  if (movement || motivation) return `${movement || "Authored camera path"}${motivation ? `; motivation: ${motivation}` : ""}`;
  return "Camera remains deliberate and story-motivated; no automatic push-in, orbit, drone sweep, random handheld drift or decorative motion.";
}
function antiGeneric(shot = {}, plan = {}) {
  const benchmark = object(benchmarkLab(plan).craft_dna);
  return unique([
    "No generic AI beauty or synthetic commercial gloss.",
    "No decorative push-in, orbit, random drone move or meaningless speed ramp.",
    "No interchangeable corporate-office, luxury-lobby or technology-ad visual shorthand unless the authored place requires it.",
    "No glowing connected-world maps, holographic dashboards, floating UI or particles forming a logo unless explicitly justified by the approved concept.",
    "No posed worker, staged smile, camera-aware performance or category-demo acting.",
    "No flat single-plane composition when the physical environment supports depth.",
    list(shot.negative_constraints),
    list(shot.must_avoid),
    list(benchmark.anti_copy_rules).map((rule) => `Benchmark anti-copy rule: ${rule}`),
  ]);
}

export function buildShotCinematicDna({ shot = {}, scene = {}, creative_plan = {} } = {}) {
  const hero = heroRequired(shot);
  const beauty = object(shot.cinematic_beauty_intent || shot.beauty_intent);
  const result = {
    contract: CONTRACT,
    version: 1,
    visual_quality_floor: QUALITY_FLOOR,
    graphic_quality_is_release_blocking: true,
    narrative_role: text(shot.purpose) || text(scene.objective) || "Advance the authored story state without decorative filler.",
    emotional_role: text(beauty.emotional_charge) || text(scene.emotion) || "Preserve the authored emotional state change.",
    scale_role: scaleRole(shot),
    visual_hierarchy: visualHierarchy(shot),
    iconic_frame: {
      required: hero,
      target: text(beauty.composition) || text(shot.frame_plan?.closing_frame) || text(shot.frame_plan?.opening_frame) || `Create one compositionally decisive frame centered on ${text(shot.subject) || "the authored subject"}.`,
      campaign_still_strength_required: hero,
    },
    composition: text(beauty.composition) || text(shot.camera?.framing) || "Composition must be deliberate, layered and story-specific.",
    depth_strategy: depthStrategy(shot),
    camera_philosophy: cameraPhilosophy(shot),
    lighting_philosophy: text(beauty.lighting) || text(shot.lighting?.exposure_intent) || "Use physically motivated light, protected highlights and dimensional subject separation.",
    atmosphere: text(beauty.atmosphere) || "Atmosphere must arise from the authored environment and physical conditions, not generic haze or synthetic glow.",
    human_consequence: humanConsequence(shot),
    place_causality: placeCausality(shot, scene),
    material_behavior: materialBehavior(shot),
    sonic_picture_role: soundRole(shot),
    benchmark_craft_principles: benchmarkPrinciples(creative_plan),
    anti_generic_constraints: antiGeneric(shot, creative_plan),
    generator_directive: "Execute the approved visual hierarchy, scale, depth, physical behavior and story state. Photorealism alone is insufficient: the shot must look intentionally directed, compositionally strong and specific to this story.",
  };
  return Object.freeze(result);
}

export function evaluateShotCinematicDna(dna = {}) {
  const failures = [];
  if (dna.contract !== CONTRACT) failures.push("SHOT_CINEMATIC_DNA_CONTRACT_REQUIRED");
  if (Number(dna.visual_quality_floor || 0) < QUALITY_FLOOR) failures.push("SHOT_VISUAL_QUALITY_FLOOR_TOO_LOW");
  for (const field of ["narrative_role","emotional_role","scale_role","visual_hierarchy","composition","depth_strategy","camera_philosophy","lighting_philosophy","atmosphere","human_consequence","place_causality","sonic_picture_role","generator_directive"]) {
    if (!text(dna[field])) failures.push(`SHOT_CINEMATIC_DNA_FIELD_REQUIRED:${field}`);
  }
  if (!text(dna.iconic_frame?.target)) failures.push("SHOT_CINEMATIC_DNA_ICONIC_FRAME_TARGET_REQUIRED");
  if (list(dna.anti_generic_constraints).length < 5) failures.push("SHOT_CINEMATIC_DNA_ANTI_GENERIC_DEPTH_REQUIRED");
  return Object.freeze({ contract: "CREATIVE_SHOT_CINEMATIC_DNA_GATE_V1", passed: failures.length === 0, failures, quality_floor: QUALITY_FLOOR });
}

export const CreativeShotCinematicDnaRuntime = Object.freeze({
  contract: CONTRACT,
  quality_floor: QUALITY_FLOOR,
  build: buildShotCinematicDna,
  evaluate: evaluateShotCinematicDna,
});
