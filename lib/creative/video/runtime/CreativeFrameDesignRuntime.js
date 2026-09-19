const CONTRACT = "CREATIVE_FRAME_DESIGN_V1";
const VISUAL_STATE_CONTRACT = "CREATIVE_VISUAL_STATE_CONDITIONING_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function unique(values = []) { return [...new Set(values.flat().map(text).filter(Boolean))]; }

function shotTier(shot = {}, cinematicDna = {}) {
  const source = lower([
    shot.purpose,
    shot.title,
    shot.reveal_stage,
    shot.transition_in,
    shot.transition_out,
    cinematicDna.iconic_frame?.target,
    shot.subject,
    JSON.stringify(shot.metadata?.shot_bible_source?.subject_truth || {}),
  ].map(text).filter(Boolean).join(" | "));
  if (cinematicDna.iconic_frame?.required === true || /hero|signature|iconic|climax|payoff|brand reveal|establish/.test(source)) return "A";
  if (/transition|bridge|connector|texture|insert/.test(source) && !/human|identity|location|product|action/.test(source)) return "C";
  return "B";
}

function subjectPlacement(shot = {}, dna = {}) {
  const explicit = text(shot.frame_design?.subject_position || shot.camera?.subject_position);
  return explicit || `Place ${text(shot.subject) || "the authored subject"} according to the approved visual hierarchy: ${text(dna.visual_hierarchy)}`;
}

function eyePath(shot = {}, dna = {}) {
  const explicit = text(shot.frame_design?.eye_path || shot.eye_path);
  return explicit || `Eye enters through the strongest authored contrast, resolves immediately to ${text(shot.subject) || "the primary subject"}, then reads depth and story consequence without competing decorative detail.`;
}
function visualStates(shot = {}, tier = "B", dna = {}) {
  const framePlan = object(shot.frame_plan);
  const opening = framePlan.opening_frame || shot.opening_frame || null;
  const closing = framePlan.closing_frame || shot.closing_frame || null;
  const progression = list(framePlan.progression_frames || framePlan.progression || shot.progression_frames);
  const key = progression[Math.floor(progression.length / 2)] || null;
  const target = text(dna.iconic_frame?.target);
  const states = [];
  if (tier === "A") {
    states.push({ role: "OPENING", required: true, authored_state: opening || { description: `Opening state designed to establish ${text(shot.subject) || "the authored subject"}.` }, frame_fraction: 0 });
    states.push({ role: "HERO", required: true, authored_state: key || { description: target || "Campaign-still-strength hero state." }, frame_fraction: 0.5 });
    states.push({ role: "CLOSING", required: true, authored_state: closing || { description: `Closing state must resolve the authored story change for ${text(shot.subject) || "the shot"}.` }, frame_fraction: 1 });
  } else if (tier === "B") {
    const preferred = opening || closing;
    states.push({ role: opening ? "OPENING" : "CLOSING", required: true, authored_state: preferred || { description: target || `Controlled narrative state for ${text(shot.subject) || "the authored shot"}.` }, frame_fraction: opening ? 0 : 1 });
  }
  return states;
}

export function buildCreativeFrameDesign({ shot = {}, cinematic_dna = {} } = {}) {
  const dna = object(cinematic_dna || shot.cinematic_dna);
  const tier = shotTier(shot, dna);
  const beauty = object(shot.cinematic_beauty_intent || shot.beauty_intent);
  const camera = object(shot.camera);
  const design = {
    contract: CONTRACT,
    version: 1,
    shot_tier: tier,
    frame_design_required: tier !== "C",
    campaign_still_test_required: tier === "A",
    subject_position: subjectPlacement(shot, dna),
    subject_scale: text(shot.frame_design?.subject_scale || camera.subject_scale) || "Scale subject deliberately against environment; never let generator default framing decide hierarchy.",
    horizon: text(shot.frame_design?.horizon || camera.horizon) || "Horizon and dominant architectural lines must be intentionally placed, level unless motivated otherwise, and support the subject hierarchy.",
    negative_space: text(shot.frame_design?.negative_space || beauty.negative_space) || "Reserve negative space only where it creates tension, scale, anticipation or brand clarity; never fill empty regions with generic detail.",
    foreground: text(shot.frame_design?.foreground) || "Use foreground only when it creates motivated depth, concealment, framing or parallax.",
    midground: text(shot.frame_design?.midground) || `Keep ${text(shot.subject) || "the primary subject"} readable in the midground or authored focal plane.`,
    background: text(shot.frame_design?.background) || "Background geometry must identify the world/place and support scale without stealing focus.",
    leading_lines: text(shot.frame_design?.leading_lines) || "Use architecture, light, terrain or object geometry to drive the eye toward the authored subject.",
    visual_balance: text(shot.frame_design?.visual_balance) || text(dna.composition) || "Balance mass, contrast and empty space deliberately; no accidental centered AI composition.",
    depth_planes: text(shot.frame_design?.depth_planes) || text(dna.depth_strategy) || "Establish distinct foreground, midground and background planes where physically plausible.",
    highlight_placement: text(shot.frame_design?.highlight_placement || shot.lighting?.highlight_placement) || "Place the strongest highlight where it reinforces the authored eye path; protect specular detail and avoid synthetic bloom.",
    shadow_placement: text(shot.frame_design?.shadow_placement || shot.lighting?.shadow_placement) || "Use shadow to shape volume, conceal secondary information and preserve dimensional separation.",
    dominant_material: text(shot.frame_design?.dominant_material || shot.production_design?.dominant_material) || text(dna.material_behavior) || "Dominant material response must be physically specific and release-critical.",
    eye_path: eyePath(shot, dna),
    iconic_frame_target: text(dna.iconic_frame?.target) || null,
    anti_generic_constraints: unique([list(dna.anti_generic_constraints), list(shot.negative_constraints), list(shot.must_avoid)]),
  };
  const states = visualStates(shot, tier, dna);
  const conditioning = {
    contract: VISUAL_STATE_CONTRACT,
    version: 1,
    shot_tier: tier,
    mode: tier === "A" ? "FIRST_KEY_LAST_CONTROLLED" : tier === "B" ? "ONE_BOUNDARY_STATE_CONTROLLED" : "STRUCTURED_T2V_ALLOWED",
    generator_may_invent_complete_composition: tier === "C",
    required_state_count: states.filter((state) => state.required).length,
    states,
    approval_required_before_generation: tier !== "C",
    release_rule: tier === "A"
      ? "Do not generate until opening, hero and closing visual states are approved or explicitly materialized by the governed frame-design path."
      : tier === "B"
        ? "Do not generate until at least one authored boundary visual state is approved or explicitly materialized by the governed frame-design path."
        : "Structured text-to-video is permitted only while preserving Cinematic DNA and Generation Envelope authority.",
  };
  return Object.freeze({ ...design, visual_state_conditioning: Object.freeze(conditioning) });
}

export function evaluateCreativeFrameDesign(frameDesign = {}) {
  const failures = [];
  if (frameDesign.contract !== CONTRACT) failures.push("FRAME_DESIGN_CONTRACT_REQUIRED");
  if (!["A", "B", "C"].includes(text(frameDesign.shot_tier))) failures.push("FRAME_DESIGN_TIER_REQUIRED");
  const conditioning = object(frameDesign.visual_state_conditioning);
  if (conditioning.contract !== VISUAL_STATE_CONTRACT) failures.push("VISUAL_STATE_CONDITIONING_CONTRACT_REQUIRED");
  if (frameDesign.shot_tier !== "C") {
    for (const field of ["subject_position", "subject_scale", "horizon", "negative_space", "foreground", "midground", "background", "leading_lines", "visual_balance", "depth_planes", "highlight_placement", "shadow_placement", "dominant_material", "eye_path"]) {
      if (!text(frameDesign[field])) failures.push(`FRAME_DESIGN_FIELD_REQUIRED:${field}`);
    }
  }
  const requiredStates = list(conditioning.states).filter((state) => state?.required === true);
  if (frameDesign.shot_tier === "A" && requiredStates.length < 3) failures.push("TIER_A_THREE_VISUAL_STATES_REQUIRED");
  if (frameDesign.shot_tier === "B" && requiredStates.length < 1) failures.push("TIER_B_BOUNDARY_VISUAL_STATE_REQUIRED");
  if (frameDesign.shot_tier === "A" && conditioning.mode !== "FIRST_KEY_LAST_CONTROLLED") failures.push("TIER_A_CONDITIONING_MODE_INVALID");
  if (frameDesign.shot_tier === "B" && conditioning.mode !== "ONE_BOUNDARY_STATE_CONTROLLED") failures.push("TIER_B_CONDITIONING_MODE_INVALID");
  if (frameDesign.shot_tier !== "C" && conditioning.generator_may_invent_complete_composition !== false) failures.push("CONTROLLED_SHOT_GENERATOR_COMPOSITION_AUTHORITY_INVALID");
  return Object.freeze({
    contract: "CREATIVE_FRAME_DESIGN_GATE_V1",
    passed: failures.length === 0,
    failures,
    shot_tier: frameDesign.shot_tier || null,
    required_state_count: requiredStates.length,
  });
}

export const CreativeFrameDesignRuntime = Object.freeze({
  contract: CONTRACT,
  visual_state_contract: VISUAL_STATE_CONTRACT,
  build: buildCreativeFrameDesign,
  evaluate: evaluateCreativeFrameDesign,
});
