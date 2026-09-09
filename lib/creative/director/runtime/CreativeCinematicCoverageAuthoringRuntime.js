import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CREATIVE_CINEMATIC_COVERAGE_CONTRACT,
} from "@/lib/creative/director/runtime/CreativeCinematicCoverageRuntime";

const AUTHORING_CONTRACT = "AVANTIQO_CINEMATIC_COVERAGE_AUTHORING_V2";
const AGENCY_CRAFT_CONTRACT = "AVANTIQO_REFERENCE_CALIBRATED_AGENCY_CRAFT_V1";
const FUTURISTIC_TENSION_CONTRACT = "AVANTIQO_FUTURISTIC_MYSTERY_TENSION_FILM_LANGUAGE_V1";
const MAX_OUTPUT_TOKENS = 24000;
const MOTION_TOKEN = /\b(?:pan|tilt|dolly|track|truck|orbit|crane|jib|push|pull|zoom|handheld|steadicam|gimbal|move|travel|arc)\b/i;
const STATIC_TOKEN = /\b(?:no movement|does not move|locked off|static|fixed frame)\b/i;

const FILM_FIELDS = Object.freeze([
  "spatial_map",
  "dominant_axis",
  "axis_strategy",
  "lens_progression",
  "shot_size_rhythm",
  "movement_rhythm",
  "reveal_hierarchy",
  "edit_strategy",
  "continuity_strategy",
  "creative_device",
  "contrast_architecture",
  "material_world",
  "human_truth_strategy",
  "brand_reveal_strategy",
  "sound_picture_causality",
  "vfx_philosophy",
  "anti_ai_artifact_rules",
  "payoff_design",
]);

const SCENE_FIELDS = Object.freeze([
  "spatial_map",
  "dominant_axis",
  "axis_strategy",
  "lens_progression",
  "shot_size_rhythm",
  "movement_rhythm",
  "reveal_hierarchy",
  "edit_strategy",
  "reestablish_strategy",
  "dramatic_function",
  "contrast_from_previous",
  "material_anchor",
  "sound_transition",
  "brand_state",
]);

const SHOT_TEXT_FIELDS = Object.freeze([
  "coverage_role",
  "camera_height",
  "camera_position",
  "subject_distance",
  "axis_relationship",
  "eyeline",
  "screen_direction",
  "entry_exit_direction",
  "match_action",
  "shot_to_shot_contrast",
  "edit_relationship",
  "continuity_consequence",
  "directorial_reasoning",
  "story_delta",
  "sensory_delta",
  "material_detail",
  "causal_link_in",
  "causal_link_out",
  "sound_sync_point",
  "brand_visibility_reason",
  "generative_risk",
  "reject_if",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizedReasoningOutput(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object") return value.result || value;
  const source = text(value, 200000);
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const parsed = JSON.parse(source.slice(first, last + 1));
    return parsed.result || parsed;
  } catch {
    return null;
  }
}

function compactShot(shot = {}) {
  return {
    id: text(shot.id, 180),
    title: text(shot.title, 300),
    purpose: text(shot.purpose, 900),
    device: text(shot.device, 900),
    subject: text(shot.subject, 700),
    action: text(shot.action, 1200),
    performance: text(shot.performance, 900),
    duration_seconds: Number(shot.duration_seconds || 0),
    frame_plan: object(shot.frame_plan),
    camera: object(shot.camera),
    continuity: object(shot.continuity),
    transition_in: text(shot.transition_in, 700),
    transition_out: text(shot.transition_out, 700),
  };
}

function compactScene(scene = {}) {
  return {
    id: text(scene.id, 180),
    title: text(scene.title, 300),
    objective: text(scene.objective, 900),
    emotion: text(scene.emotion, 500),
    story_state_before: text(scene.story_state_before, 900),
    state_change: text(scene.state_change, 900),
    story_state_after: text(scene.story_state_after, 900),
    transition_logic: text(scene.transition_logic, 900),
    location: object(scene.location),
    camera_style: object(scene.camera_style),
    shots: list(scene.shots).map(compactShot),
  };
}


function sourcePlanCanAuthorCoverage(plan = {}) {
  const scenes = list(plan.scenes);
  if (!scenes.length) return false;
  return scenes.every((scene) =>
    text(scene.objective, 900).length >= 20 &&
    text(scene.state_change, 900).length >= 16 &&
    text(scene.transition_logic, 900).length >= 16 &&
    list(scene.shots).length > 0 &&
    list(scene.shots).every((shot) =>
      text(shot.purpose, 900).length >= 16 &&
      text(shot.action, 1200).length >= 20 &&
      text(shot.frame_plan?.opening_frame, 1200).length >= 20 &&
      text(shot.frame_plan?.progression, 1200).length >= 20 &&
      text(shot.frame_plan?.closing_frame, 1200).length >= 20 &&
      text(shot.camera?.framing, 700).length >= 5 &&
      text(shot.camera?.lens_intent, 700).length >= 5 &&
      text(shot.camera?.movement_path, 700).length >= 5 &&
      text(shot.production_design?.environment, 900).length >= 8 &&
      text(shot.audio?.source_sound, 900).length >= 8
    )
  );
}

function derivedCoverageForShot(shot = {}, scene = {}, shotIndex = 0, shotCount = 1) {
  const camera = object(shot.camera);
  const continuity = object(shot.continuity);
  const frame = object(shot.frame_plan);
  const design = object(shot.production_design);
  const audio = object(shot.audio);
  const movement = text(camera.movement_path, 1000);
  const staticShot = STATIC_TOKEN.test(movement) && !MOTION_TOKEN.test(movement.replace(/no movement|locked off|static|fixed frame/gi, ''));
  const subjectDistance = text(camera.camera_distance, 800) || `Distance follows the authored ${text(camera.framing, 300) || 'framing'} so subject scale remains legible.`;
  const screenDirection = text(continuity.screen_direction, 800) || `Screen direction follows the authored action: ${text(shot.action, 500)}.`;
  const material = [design.materials, design.texture_detail, design.props].map((v) => text(v, 600)).filter(Boolean).join('; ');
  return {
    coverage_role: `${text(shot.purpose, 700)} The shot changes audience knowledge through ${text(shot.action, 700)}.`,
    camera_height: text(camera.angle, 500) || `Camera height is governed by the authored ${text(camera.framing, 300)} relationship.`,
    camera_position: `${text(camera.framing, 500)} from ${subjectDistance}; ${text(camera.movement_path, 600)}.`,
    subject_distance: subjectDistance,
    axis_relationship: `Hold the established scene axis while preserving ${screenDirection}`,
    axis_break: false,
    axis_break_motivation: 'The established axis is held because spatial clarity is stronger than an unmotivated break.',
    reestablish_strategy: `Geography stays legible through ${text(continuity.spatial_geography, 700) || text(scene.location?.name, 500) || 'the established scene layout'}.`,
    eyeline: 'No human eyeline is required; subject orientation and physical motion provide the directional relationship.',
    eyeline_match_required: false,
    eyeline_match_status: 'NOT_REQUIRED',
    screen_direction: screenDirection,
    screen_direction_status: 'MATCHED',
    intentional_screen_direction_break: false,
    screen_direction_break_motivation: 'Screen direction is preserved because the authored action remains continuous.',
    entry_exit_direction: `${shotIndex === 0 ? 'Entry begins from the scene opening state' : 'Entry inherits the previous shot direction'}; exit hands the visible action to ${shotIndex + 1 < shotCount ? 'the next shot' : 'the next scene state'}.`,
    match_action: `The cut is carried by ${text(shot.action, 700)} and the closing state ${text(frame.closing_frame, 700)}.`,
    shot_to_shot_contrast: `Contrast comes from the authored framing, lens, subject scale and story delta rather than a decorative camera change.`,
    edit_compatibility_status: 'COMPATIBLE',
    edit_relationship: `The opening state ${text(frame.opening_frame, 600)} progresses causally to ${text(frame.closing_frame, 600)}, giving adjacent cuts a visible state change.`,
    continuity_consequence: `Following coverage must preserve ${text(continuity.identity, 500) || text(shot.subject, 500)}, ${text(continuity.location, 500) || text(scene.location?.name, 500)}, and ${screenDirection}`,
    intentional_stillness: staticShot,
    directorial_reasoning: `${text(camera.movement_motivation, 700) || 'The authored camera choice follows the physical action'}; this protects the shot from generic movement-for-movement's-sake.`,
    story_delta: `${text(shot.purpose, 700)} Visible change: ${text(shot.action, 700)}.`,
    sensory_delta: `The shot changes scale, motion, texture or sound through ${text(camera.framing, 400)}, ${text(camera.movement_path, 400)}, ${text(design.texture_detail, 500) || text(design.environment, 500)} and ${text(audio.source_sound, 500)}.`,
    material_detail: material || text(design.environment, 800) || 'The authored physical environment provides the material anchor.',
    causal_link_in: `${text(shot.transition_in, 700) || 'The prior state causes this frame to arrive'}; opening state: ${text(frame.opening_frame, 700)}.`,
    causal_link_out: `${text(shot.transition_out, 700) || 'This shot hands off through its completed action'}; closing state: ${text(frame.closing_frame, 700)}.`,
    sound_sync_point: `Primary sound follows the visible action: ${text(audio.source_sound, 700)}; mix intent: ${text(audio.mix_intent, 700)}.`,
    brand_visibility_reason: `Brand or product identity remains only where the authored continuity/product rules permit it; generated text and logos are not introduced by coverage.`,
    generative_risk: text(list(shot.known_failure_modes)[0], 700) || 'Synthetic texture, physical inconsistency or continuity drift would break the authored shot.',
    reject_if: text(list(shot.negative_constraints)[0], 700) || 'Reject if the authored subject, geography, camera physics or material truth is no longer credible.',
  };
}

function deriveAuthoredCoverage(plan = {}) {
  const scenes = list(plan.scenes);
  const firstScene = scenes[0] || {};
  const lastScene = scenes[scenes.length - 1] || {};
  const allShots = scenes.flatMap((scene) => list(scene.shots));
  const firstShot = allShots[0] || {};
  const lastShot = allShots[allShots.length - 1] || {};
  const materialWorld = [...new Set(allShots.map((shot) => text(shot.production_design?.environment, 600)).filter(Boolean))].join('; ');
  return {
    contract: AUTHORING_CONTRACT,
    film_coverage: {
      spatial_map: `Geography progresses from ${text(firstScene.location?.name, 500) || 'the opening environment'} through the ordered scene states to ${text(lastScene.location?.name, 500) || 'the final environment'}, preserving screen direction and location continuity at every handoff.`,
      dominant_axis: `The governing axis follows the primary physical action and subject travel described by the authored screen-direction and spatial-geography fields.`,
      axis_strategy: `Hold the established action axis unless the already-authored shot explicitly motivates a different spatial relationship; no decorative axis break is introduced.`,
      lens_progression: `Optical perspective follows the existing authored lens sequence from ${text(firstShot.camera?.lens_intent, 500)} to ${text(lastShot.camera?.lens_intent, 500)}, using scale change to reveal information rather than arbitrary lens variety.`,
      shot_size_rhythm: `Shot size follows the authored framing sequence so each cut changes information, proximity or scale while preserving the five-second causal progression.`,
      movement_rhythm: `Movement and stillness are inherited from each shot's motivated camera path; locked frames hold precision while tracking or pans follow visible action only when earned.`,
      reveal_hierarchy: `The film reveals information in the authored order: ${scenes.map((scene) => text(scene.state_change, 500)).filter(Boolean).join(' -> ')}.`,
      edit_strategy: `Cuts follow visible state change, screen direction, physical action and sound continuity; no montage beat is inserted without a causal handoff.`,
      continuity_strategy: `Preserve subject identity, product truth, location geography, screen direction and material state from every shot's continuity block.`,
      creative_device: `The ownable mechanism is the authored progression of physical approach, reveal and payoff through real material scale, controlled camera behavior and source-led sound.`,
      contrast_architecture: `Contrast is built from authored changes in scale, proximity, motion versus stillness, environment density, light and sound pressure rather than arbitrary spectacle.`,
      material_world: materialWorld || 'The authored production-design environments, textures, surfaces and atmospheric forces make the film physically tangible.',
      human_truth_strategy: `Visible people are used only when the authored plan requires them; otherwise machinery, environment and physical source behavior carry the truth without invented stock performance.`,
      brand_reveal_strategy: `Brand and product visibility obey the existing continuity and reference-authority rules; identity is withheld where not earned and never invented inside generated pixels.`,
      sound_picture_causality: `Source sound, ambience and mix intent are bound to the visible action in each shot; sound leads or answers physical events instead of sitting as generic music under montage.`,
      vfx_philosophy: `Synthetic cinema is allowed, but VFX must preserve subject identity, geography, material physics, camera reality and the authored environmental forces without visible generative artifacts.`,
      anti_ai_artifact_rules: `Reject identity drift, synthetic texture, impossible motion, unstable geometry, unmotivated camera behavior, generic category imagery, fake text and any discontinuity named by the shot failure controls.`,
      payoff_design: `The final authored state ${text(lastScene.story_state_after, 700) || text(lastShot.frame_plan?.closing_frame, 700)} resolves the accumulated approach/reveal logic through picture, source sound and material scale.`,
    },
    scenes: scenes.map((scene, sceneIndex) => ({
      id: scene.id,
      coverage_plan: {
        spatial_map: `${text(scene.location?.name, 500) || 'The scene location'}: ${text(scene.location?.scale, 600) || text(scene.location?.atmosphere, 600)}.`,
        dominant_axis: `The scene axis follows ${text(scene.camera_style?.movement, 500) || text(list(scene.shots)[0]?.continuity?.screen_direction, 500) || 'the authored subject action'}.`,
        axis_strategy: `Hold the scene's established action axis so the audience can read the physical progression without spatial reset.`,
        lens_progression: `Lens choice follows the authored shot sequence: ${list(scene.shots).map((s) => text(s.camera?.lens_intent, 300)).filter(Boolean).join(' -> ')}.`,
        shot_size_rhythm: `Framing progresses as authored: ${list(scene.shots).map((s) => text(s.camera?.framing, 300)).filter(Boolean).join(' -> ')}.`,
        movement_rhythm: `Movement rhythm follows the existing paths: ${list(scene.shots).map((s) => text(s.camera?.movement_path, 300)).filter(Boolean).join(' -> ')}.`,
        reveal_hierarchy: `${text(scene.story_state_before, 500)} -> ${text(scene.state_change, 500)} -> ${text(scene.story_state_after, 500)}.`,
        edit_strategy: `Each shot cuts on physical or perceptual change while preserving ${text(scene.transition_logic, 600)}.`,
        reestablish_strategy: `Geography remains anchored by ${text(scene.location?.name, 500) || 'the established environment'} and the shots' spatial-geography continuity.`,
        dramatic_function: `${text(scene.objective, 700)} Audience state changes through ${text(scene.state_change, 700)}.`,
        contrast_from_previous: sceneIndex === 0 ? `The opening establishes the baseline scale, light, motion and sonic pressure against which later scenes can change.` : `This scene changes the prior state through ${text(scene.state_change, 700)} while preserving the causal location/action chain.`,
        material_anchor: text(list(scene.shots)[0]?.production_design?.texture_detail, 700) || text(list(scene.shots)[0]?.production_design?.environment, 700) || 'The authored environment and surface behavior anchor the scene.',
        sound_transition: text(list(scene.shots)[0]?.audio?.source_sound, 700) || 'Physical ambience bridges the scene boundary and follows visible action.',
        brand_state: `IMPLIED: subject and product truth remain visible only through the approved physical references; no unearned logo or text reveal is added.`,
      },
      shots: list(scene.shots).map((shot, shotIndex, shots) => ({
        id: shot.id,
        coverage: derivedCoverageForShot(shot, scene, shotIndex, shots.length),
      })),
    })),
  };
}

function coveragePrompt({ plan, project, brief }) {
  const scenes = list(plan.scenes).map(compactScene);
  return `
You are Avantiqo's Director of Photography, continuity supervisor and picture editor.
The film is already creatively directed. Your job is NOT to rewrite the story, action,
performance, shot count, camera direction or edit concept. Your job is to make the existing
film behave like one deliberately photographed and edited production by authoring the missing
whole-film coverage grammar.

Return strict JSON only with this exact structure:
{
  "contract": "${AUTHORING_CONTRACT}",
  "film_coverage": {
    "spatial_map": "how the film teaches and preserves geography",
    "dominant_axis": "the governing screen axis or why no single axis applies",
    "axis_strategy": "when the axis is held, re-established or intentionally broken",
    "lens_progression": "how optical perspective evolves across the film and why",
    "shot_size_rhythm": "how shot size changes create emphasis and prevent monotony",
    "movement_rhythm": "where movement, handheld energy and stillness are used and withheld",
    "reveal_hierarchy": "what visual information is withheld, revealed and escalated",
    "edit_strategy": "how adjacent shots cut together through action, contrast, sound or state change",
    "continuity_strategy": "how eyelines, screen direction, entrances/exits and spatial logic stay legible",
    "creative_device": "the one ownable cinematic mechanism that makes this film recognisable without copying another campaign",
    "contrast_architecture": "the planned contrast system across scale, speed, silence, density, light, shot size and motion",
    "material_world": "the recurring physical textures, surfaces, atmosphere and environmental forces that make the film tangible",
    "human_truth_strategy": "how people behave naturally under real pressure; ban ad-performer posing and generic AI reactions",
    "brand_reveal_strategy": "when brand/product identity is withheld, implied, revealed and earned; never contaminate unrelated frames",
    "sound_picture_causality": "how music, silence, impacts, ambience and source sound cause or answer picture events",
    "vfx_philosophy": "what must be practical/photographic, what may be synthetic, and how VFX remains physically credible",
    "anti_ai_artifact_rules": "specific visual and editorial signatures that would make the film feel generated and therefore cause rejection",
    "payoff_design": "the final emotional, visual and sonic convergence that makes the preceding structure feel inevitable"
  },
  "scenes": [{
    "id": "exact existing scene id",
    "coverage_plan": {
      "spatial_map": "scene geography",
      "dominant_axis": "scene axis",
      "axis_strategy": "hold/break/re-establish plan",
      "lens_progression": "scene lens progression",
      "shot_size_rhythm": "scene shot-size rhythm",
      "movement_rhythm": "scene movement/stillness rhythm",
      "reveal_hierarchy": "scene reveal order",
      "edit_strategy": "how this scene's shots are intended to cut",
      "reestablish_strategy": "how geography is re-established after any deliberate disruption",
      "dramatic_function": "why this scene exists in the whole film and what audience state it must change",
      "contrast_from_previous": "the exact contrast with the preceding scene or why continuity without contrast is stronger",
      "material_anchor": "the physical texture/object/environmental behavior that grounds the scene",
      "sound_transition": "the sonic bridge, rupture, prelap, silence or impact connecting this scene to adjacent scenes",
      "brand_state": "WITHHELD|IMPLIED|REVEALED|HERO and why that state is earned here"
    },
    "shots": [{
      "id": "exact existing shot id",
      "coverage": {
        "coverage_role": "the shot's exact informational/editorial role; do not force a canned taxonomy",
        "camera_height": "physical or perceptual camera height",
        "camera_position": "camera position relative to subject and scene geography",
        "subject_distance": "subject-to-camera spatial relationship",
        "axis_relationship": "which side of the established axis this shot occupies and why",
        "axis_break": false,
        "axis_break_motivation": "real reason when axis_break is true; otherwise explain why the axis is held",
        "reestablish_strategy": "how geography remains clear or is re-established",
        "eyeline": "precise eyeline direction/target or why no eyeline relationship exists",
        "eyeline_match_required": false,
        "eyeline_match_status": "MATCHED|NOT_REQUIRED|INTENTIONALLY_BROKEN",
        "screen_direction": "precise movement/orientation direction or why none applies",
        "screen_direction_status": "MATCHED|NOT_REQUIRED|INTENTIONALLY_BROKEN",
        "intentional_screen_direction_break": false,
        "screen_direction_break_motivation": "reason for an intentional break or why direction is preserved",
        "entry_exit_direction": "entry and exit vectors or explicit no-entry/no-exit reasoning",
        "match_action": "what action/gesture/object/sound can carry the cut or why a match cut is not intended",
        "shot_to_shot_contrast": "how this shot differs from the adjacent shot in size, angle, lens, movement, information or emotion",
        "edit_compatibility_status": "COMPATIBLE",
        "edit_relationship": "why the incoming and outgoing cuts work",
        "continuity_consequence": "what this shot establishes that following shots must respect",
        "intentional_stillness": false,
        "directorial_reasoning": "why this exact coverage choice is stronger for this story beat than competent generic coverage",
        "story_delta": "the new story information or audience-state change delivered by this shot; repetition is not enough",
        "sensory_delta": "what changes sensorially versus the adjacent shot: scale, motion, density, light, texture, silence, sound or perspective",
        "material_detail": "the concrete physical detail that prevents an abstract/generated feel",
        "causal_link_in": "what action, sound, visual force or state from the previous shot causes this shot to arrive",
        "causal_link_out": "what this shot causes, motivates or withholds for the next shot",
        "sound_sync_point": "the exact picture event that sound, music, silence or ambience must hit or deliberately avoid",
        "brand_visibility_reason": "why brand/product identity is visible or intentionally absent in this frame",
        "generative_risk": "the most likely synthetic/AI failure specific to this shot",
        "reject_if": "a concrete failure condition that means this shot cannot enter the master"
      }
    }]
  }]
}

NON-NEGOTIABLE RULES
- Use every existing scene id exactly once and every existing shot id exactly once. Never invent or rename ids.
- Do not add, remove, reorder or rewrite scenes or shots. Return coverage only.
- REFERENCE CALIBRATION: the minimum craft bar is elite global automotive/luxury launch-film authorship such as Lamborghini Revuelto “From Now On”; principles only, never imitate its compositions, car imagery, edit sequence, music, VFX motifs or brand assets.
- FILM LANGUAGE: premium futuristic mystery and controlled tension are required where appropriate to the brief. Reveal information in layers, let darkness and negative space withhold rather than obscure, and use selective practical light, reflections, silhouettes, scale shifts, sonic pre-laps and abrupt density changes to create anticipation.
- Do not turn real locations into postcards or professions into stock-office clichés. Translate Phuket, accounting, logistics, hospitality, finance or any other business truth into the same authored cinematic world while preserving semantic truth.
- Every reveal must be earned. Do not show the whole environment, object or process immediately when fragments, consequences, texture, sound or partial geometry can create stronger anticipation first.
- Mystery must remain legible: ambiguity is allowed, confusion is not. The audience should want to know more while still understanding the story state.
- The film must feel authored by a senior agency team before generation begins. Beautiful disconnected shots are failure.
- Every shot must create a story delta or sensory delta and must have causal links to adjacent shots.
- Material physicality is mandatory: surfaces, atmosphere, weight, friction, air, light behavior, environmental motion or human micro-behavior must ground the frame.
- Brand revelation must be designed across the whole film. Logos/products may not leak into frames where the plan says WITHHELD or IMPLIED.
- Sound and picture must be designed together. Generic music-under-montage, generic AI whooshes and unmotivated impacts are failure.
- Camera movement is craft, not the creative device. Do not pretend a push-in or orbit is the idea.
- Preserve the existing camera block. Coverage explains its relationship to the film; it does not silently replace it.
- A locked-off frame is a valid and often stronger decision. intentional_stillness may be true only when the existing camera direction is actually still.
- Never cross the 180-degree axis merely for variety. axis_break=true requires a story/spatial motivation and a re-establish strategy.
- If an eyeline match is required, status must be MATCHED unless the film deliberately disorients the audience; intentional breaks need an explicit consequence and recovery logic.
- Screen direction may only be broken intentionally. Do not call a contradiction creative after the fact.
- edit_compatibility_status must be COMPATIBLE. If the existing shot direction cannot cut coherently, explain the repair in directorial_reasoning but do not fabricate compatibility; the response will be rejected and the film must be repaired before production.
- Avoid repetitive shot size/lens/movement patterns unless repetition is the deliberate formal device.
- Do not turn this into a Hollywood coverage template. A scene may be one unbroken shot, intentionally frontal, graphic, observational, unstable or formally strange when that is what the story earns.
- For graphic/text-only shots, describe the editorial/spatial relationship without inventing a physical lens or camera that does not exist.
- Do not emit provider prompts, provider parameters, model names or production vendor details.

FILM CONCEPT
${JSON.stringify({
  concept: object(plan.concept),
  story: object(plan.story),
  film_output: object(list(plan.deliverables)[0]?.output_spec),
})}

PROJECT CONTEXT
${JSON.stringify({
  id: project?.id || null,
  objective: project?.objective || null,
  production_type: project?.production_type || null,
  brief_objective: brief?.creative_objective || brief?.business_goal || null,
})}

DIRECTED SCENES AND SHOTS
${JSON.stringify(scenes)}
`;
}

function failure(code, path, message, evidence = null) {
  return { code, path, message, evidence };
}

function requiredText(failures, value, path, minimum = 8) {
  const normalized = text(value, 4000);
  if (!normalized || normalized.length < minimum) {
    failures.push(failure(
      "COVERAGE_DIRECTION_REQUIRED",
      path,
      `${path} requires concrete coverage direction, not a blank or label.`,
      normalized || null,
    ));
  }
}

function validateShotCoverage({ sourceShot, authoredShot, sceneIndex, shotIndex, failures }) {
  const base = `scenes.${sceneIndex}.shots.${shotIndex}.coverage`;
  const coverage = object(authoredShot.coverage);
  for (const field of SHOT_TEXT_FIELDS) {
    requiredText(failures, coverage[field], `${base}.${field}`, field === "eyeline" ? 4 : 8);
  }

  for (const field of [
    "axis_break",
    "eyeline_match_required",
    "intentional_screen_direction_break",
    "intentional_stillness",
  ]) {
    if (typeof coverage[field] !== "boolean") {
      failures.push(failure(
        "COVERAGE_BOOLEAN_REQUIRED",
        `${base}.${field}`,
        `${base}.${field} must be an explicit boolean.`,
        coverage[field],
      ));
    }
  }

  const eyelineStatus = text(coverage.eyeline_match_status, 80).toUpperCase();
  if (!["MATCHED", "NOT_REQUIRED", "INTENTIONALLY_BROKEN"].includes(eyelineStatus)) {
    failures.push(failure(
      "COVERAGE_EYELINE_STATUS_INVALID",
      `${base}.eyeline_match_status`,
      "Eyeline status must be MATCHED, NOT_REQUIRED or INTENTIONALLY_BROKEN.",
      coverage.eyeline_match_status,
    ));
  }
  if (coverage.eyeline_match_required === true && eyelineStatus === "NOT_REQUIRED") {
    failures.push(failure(
      "COVERAGE_EYELINE_REQUIREMENT_CONTRADICTED",
      `${base}.eyeline_match_status`,
      "The shot says an eyeline match is required but also marks it NOT_REQUIRED.",
    ));
  }

  const screenStatus = text(coverage.screen_direction_status, 80).toUpperCase();
  if (!["MATCHED", "NOT_REQUIRED", "INTENTIONALLY_BROKEN"].includes(screenStatus)) {
    failures.push(failure(
      "COVERAGE_SCREEN_DIRECTION_STATUS_INVALID",
      `${base}.screen_direction_status`,
      "Screen-direction status must be MATCHED, NOT_REQUIRED or INTENTIONALLY_BROKEN.",
      coverage.screen_direction_status,
    ));
  }
  if (
    screenStatus === "INTENTIONALLY_BROKEN" &&
    coverage.intentional_screen_direction_break !== true
  ) {
    failures.push(failure(
      "COVERAGE_SCREEN_DIRECTION_BREAK_FLAG_REQUIRED",
      `${base}.intentional_screen_direction_break`,
      "An intentionally broken screen direction requires the explicit boolean break flag.",
    ));
  }
  if (coverage.intentional_screen_direction_break === true) {
    requiredText(
      failures,
      coverage.screen_direction_break_motivation,
      `${base}.screen_direction_break_motivation`,
      20,
    );
  }

  if (coverage.axis_break === true) {
    requiredText(failures, coverage.axis_break_motivation, `${base}.axis_break_motivation`, 20);
    requiredText(failures, coverage.reestablish_strategy, `${base}.reestablish_strategy`, 20);
  }

  if (text(coverage.edit_compatibility_status, 80).toUpperCase() !== "COMPATIBLE") {
    failures.push(failure(
      "COVERAGE_EDIT_INCOMPATIBLE",
      `${base}.edit_compatibility_status`,
      "New temporal direction may proceed only when each shot is explicitly compatible with its intended edit relationship.",
      coverage.edit_compatibility_status,
    ));
  }

  const movement = text(sourceShot?.camera?.movement_path, 1200);
  if (
    coverage.intentional_stillness === true &&
    MOTION_TOKEN.test(movement) &&
    !STATIC_TOKEN.test(movement)
  ) {
    failures.push(failure(
      "COVERAGE_STILLNESS_MOVEMENT_CONTRADICTION",
      `${base}.intentional_stillness`,
      "Coverage declares intentional stillness while the immutable camera block specifies physical movement.",
      movement,
    ));
  }
}

export function validateAuthoredCinematicCoverage(plan = {}, authored = {}) {
  const failures = [];
  if (text(authored.contract, 160) !== AUTHORING_CONTRACT) {
    failures.push(failure(
      "COVERAGE_AUTHORING_CONTRACT_INVALID",
      "contract",
      `Coverage authoring must declare ${AUTHORING_CONTRACT}.`,
      authored.contract || null,
    ));
  }

  const filmCoverage = object(authored.film_coverage);
  for (const field of FILM_FIELDS) {
    requiredText(failures, filmCoverage[field], `film_coverage.${field}`, 20);
  }

  const sourceScenes = list(plan.scenes);
  const authoredScenes = list(authored.scenes);
  const sourceSceneIds = new Set(sourceScenes.map((scene) => text(scene.id, 180)).filter(Boolean));
  const authoredSceneIds = authoredScenes.map((scene) => text(scene.id, 180)).filter(Boolean);
  if (
    authoredSceneIds.length !== sourceSceneIds.size ||
    new Set(authoredSceneIds).size !== authoredSceneIds.length ||
    authoredSceneIds.some((id) => !sourceSceneIds.has(id))
  ) {
    failures.push(failure(
      "COVERAGE_SCENE_IDENTITY_MISMATCH",
      "scenes",
      "Coverage must return every existing scene exactly once and no invented scene ids.",
      authoredSceneIds,
    ));
  }

  sourceScenes.forEach((sourceScene, sceneIndex) => {
    const sceneId = text(sourceScene.id, 180);
    const authoredScene = authoredScenes.find((candidate) => text(candidate.id, 180) === sceneId);
    if (!authoredScene) return;

    const sceneCoverage = object(authoredScene.coverage_plan);
    for (const field of SCENE_FIELDS) {
      requiredText(failures, sceneCoverage[field], `scenes.${sceneIndex}.coverage_plan.${field}`, 16);
    }

    const sourceShots = list(sourceScene.shots);
    const authoredShots = list(authoredScene.shots);
    const sourceShotIds = new Set(sourceShots.map((shot) => text(shot.id, 180)).filter(Boolean));
    const authoredShotIds = authoredShots.map((shot) => text(shot.id, 180)).filter(Boolean);
    if (
      authoredShotIds.length !== sourceShotIds.size ||
      new Set(authoredShotIds).size !== authoredShotIds.length ||
      authoredShotIds.some((id) => !sourceShotIds.has(id))
    ) {
      failures.push(failure(
        "COVERAGE_SHOT_IDENTITY_MISMATCH",
        `scenes.${sceneIndex}.shots`,
        "Coverage must return every existing shot exactly once and no invented shot ids.",
        authoredShotIds,
      ));
      return;
    }

    sourceShots.forEach((sourceShot, shotIndex) => {
      const shotId = text(sourceShot.id, 180);
      const authoredShot = authoredShots.find((candidate) => text(candidate.id, 180) === shotId);
      if (!authoredShot) return;
      validateShotCoverage({
        sourceShot,
        authoredShot,
        sceneIndex,
        shotIndex,
        failures,
      });
    });
  });

  return {
    contract: AUTHORING_CONTRACT,
    passed: failures.length === 0,
    failures,
  };
}

function mergeCoverage(plan = {}, authored = {}) {
  const authoredScenes = list(authored.scenes);
  return {
    ...plan,
    cinematic_coverage: {
      contract: CREATIVE_CINEMATIC_COVERAGE_CONTRACT.contract,
      authoring_contract: AUTHORING_CONTRACT,
      agency_craft_contract: AGENCY_CRAFT_CONTRACT,
      reference_calibration: {
        minimum_standard: "ELITE_GLOBAL_LUXURY_LAUNCH_FILM",
        reference: "LAMBORGHINI_REVUELTO_FROM_NOW_ON",
        principles_only: true,
        imitation_forbidden: true,
        disconnected_beautiful_shots_forbidden: true,
        generated_feel_forbidden: true,
        futuristic_mystery_tension_contract: FUTURISTIC_TENSION_CONTRACT,
        reveal_policy: "WITHHOLD_ESCALATE_EARNED_REVEAL",
        mystery_must_remain_legible: true,
        postcard_and_stock_category_cliche_forbidden: true,
      },
      ...object(authored.film_coverage),
    },
    scenes: list(plan.scenes).map((scene) => {
      const authoredScene = authoredScenes.find(
        (candidate) => text(candidate.id, 180) === text(scene.id, 180),
      );
      const authoredShots = list(authoredScene?.shots);
      return {
        ...scene,
        coverage_plan: object(authoredScene?.coverage_plan),
        shots: list(scene.shots).map((shot) => {
          const authoredShot = authoredShots.find(
            (candidate) => text(candidate.id, 180) === text(shot.id, 180),
          );
          return {
            ...shot,
            coverage: object(authoredShot?.coverage),
          };
        }),
      };
    }),
  };
}

export const CreativeCinematicCoverageAuthoringRuntime = Object.freeze({
  contract: AUTHORING_CONTRACT,
  agency_craft_contract: AGENCY_CRAFT_CONTRACT,

  async create({
    organization_id,
    mission = {},
    project = {},
    brief = {},
    plan = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!project?.id) throw new Error("creative_project_id required");
    if (!list(plan.scenes).length) throw new Error("CREATIVE_CINEMATIC_COVERAGE_SCENES_REQUIRED");

    if (sourcePlanCanAuthorCoverage(plan)) {
      const authored = deriveAuthoredCoverage(plan);
      const validation = validateAuthoredCinematicCoverage(plan, authored);
      if (validation.passed) {
        return {
          plan: mergeCoverage(plan, authored),
          authored,
          validation,
          provider: null,
          model: null,
          usage: null,
          billing: null,
          derived_from_validated_temporal_direction: true,
          media_generation_executed: false,
        };
      }
    }

    const result = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: "ai.reasoning.execute",
      provider_id: null,
      category: "CREATIVE_DIRECTION",
      input: {
        quantity: 1,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        prompt: coveragePrompt({ plan, project, brief }),
      },
      metadata: {
        module: "CREATIVE",
        operation: "CINEMATIC_COVERAGE_AUTHORING_V1",
        creative_mission_id: mission?.id || mission?.creative_mission_id || null,
        creative_project_id: project.id,
        coverage_contract: CREATIVE_CINEMATIC_COVERAGE_CONTRACT.contract,
        media_generation_executed: false,
      },
    });

    const authored = normalizedReasoningOutput(result);
    if (!authored) throw new Error("CREATIVE_CINEMATIC_COVERAGE_OUTPUT_INVALID");

    const validation = validateAuthoredCinematicCoverage(plan, authored);
    if (!validation.passed) {
      const error = new Error(
        `CREATIVE_CINEMATIC_COVERAGE_INVALID:${validation.failures.length}`,
      );
      error.status = 422;
      error.coverage_validation = validation;
      throw error;
    }

    return {
      plan: mergeCoverage(plan, authored),
      authored,
      validation,
      provider: result?.provider || result?.output?.provider || null,
      model: result?.model || result?.output?.model || null,
      usage: result?.usage || result?.output?.usage || null,
      billing: result?.billing || result?.output?.billing || null,
      media_generation_executed: false,
    };
  },
});

export default CreativeCinematicCoverageAuthoringRuntime;
