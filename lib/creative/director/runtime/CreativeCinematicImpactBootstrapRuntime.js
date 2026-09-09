import crypto from "node:crypto";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function normalized(value) {
  return text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, canonical(value[key])]));
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function takeWithFallback(values, fallback, count) {
  const result = unique(values);
  for (const value of fallback) if (result.length < count && text(value)) result.push(text(value));
  return result.slice(0, Math.max(count, result.length));
}
function actorFree(plan = {}) {
  const scenes = list(plan.scenes);
  return scenes.length > 0 && scenes.every((scene) =>
    list(scene.actors).length === 0 &&
    list(scene.shots).every((shot) => list(shot.actors).length === 0),
  );
}
function forbidsVisibleActors(plan = {}) {
  const rules = list(plan.scenes).flatMap((scene) =>
    list(scene.shots).flatMap((shot) => list(shot.negative_constraints)),
  ).map(normalized);
  return actorFree(plan) && rules.some((rule) =>
    rule.includes("no human elements") || rule.includes("without human elements") ||
    rule.includes("no visible human") || rule.includes("no visible actor") ||
    rule.includes("no humans"),
  );
}
function assetEvidence(scene = {}, plan = {}) {
  return text(scene.location?.reference_asset_id) ||
    text(list(scene.reference_asset_ids)[0]) ||
    text(list(plan.asset_manifest)[0]?.asset_id || list(plan.asset_manifest)[0]?.id) ||
    text(plan.story?.observable_proof) || text(plan.concept?.creative_thesis);
}
function emotionSequence(plan = {}) {
  const arc = text(plan.story?.emotional_arc).split(/→|->/).map(text).filter(Boolean);
  return takeWithFallback(arc, list(plan.scenes).map((scene) => scene.emotion), 3);
}
function buildUnderstanding(plan = {}) {
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const concept = object(plan.concept);
  const story = object(plan.story);
  const review = object(plan.creative_review);
  const targetAudience = text(concept.target_audience?.description) ||
    "Decision-makers evaluating the credibility and value of this specific proposition.";
  const attentionTriggers = takeWithFallback([
    concept.hook, story.observable_proof, story.turn,
    ...scenes.map((scene) => scene.state_change),
  ], [story.hook, story.escalation, story.resolution], 3);
  const attentionRisks = takeWithFallback(
    [...list(review.craft_risks), ...list(concept.refused_devices)],
    ["Generic category imagery would erase the authored truth.", "Repeated camera language would reduce attention.", "Weak physical causality would make the work feel synthetic."], 3,
  );
  const credibilitySignals = takeWithFallback([
    story.observable_proof,
    ...list(plan.asset_manifest).map((entry) => entry.reason || entry.asset_id || entry.id),
  ], [concept.creative_thesis, story.resolution], 2);
  const noVisibleActors = forbidsVisibleActors(plan);
  const highValueActions = shots.slice(0, 6).map((shot) => ({
    action: text(shot.action),
    why_it_matters: text(shot.purpose) || text(story.observable_proof),
    interaction: text(shot.frame_plan?.closing_frame) || text(shot.subject),
  })).filter((entry) => entry.action);
  const principles = takeWithFallback([
    ...shots.map((shot) => shot.camera?.movement_motivation),
    ...shots.map((shot) => shot.camera?.lens_intent),
    ...shots.map((shot) => shot.camera?.framing),
  ], ["Camera movement follows visible action rather than decoration.", "Lens choice preserves scale and subject truth.", "Focus hierarchy protects the active story question."], 3);
  const wowHypotheses = scenes.map((scene) => ({
    setup: text(scene.story_state_before) || text(scene.objective),
    payoff: text(scene.state_change) || text(scene.story_state_after),
    why_the_audience_cares: text(scene.emotion) || text(scene.objective),
    truth_anchor: assetEvidence(scene, plan),
  }));
  return {
    contract: "CREATIVE_CINEMATIC_AUDIENCE_UNDERSTANDING_V1",
    audience_model: {
      primary_audience: targetAudience,
      current_state: text(story.audience_tension) || "The audience needs credible proof before accepting the proposition.",
      desired_state: [concept.emotional_promise, concept.call_to_action, story.resolution].map(text).filter(Boolean).join(" ") || "The audience should leave with earned confidence in the demonstrated truth.",
      attention_triggers: attentionTriggers,
      attention_risks: attentionRisks,
      credibility_signals: credibilitySignals,
      aspiration_signals: takeWithFallback([concept.emotional_promise, story.resolution], [concept.creative_thesis], 1),
      emotional_sequence: emotionSequence(plan),
    },
    human_ecosystem: {
      required: noVisibleActors ? false : !actorFree(plan),
      reason: noVisibleActors
        ? "The approved temporal direction explicitly forbids visible human elements, so environment, machinery, sound and spatial change must carry the story."
        : "Visible story-world people are required only where the already-authored scenes contain actors whose actions materially change the story state.",
      role_categories: noVisibleActors ? [] : unique(scenes.flatMap((scene) => list(scene.actors)).map((actor) => actor?.role || actor?.name)).map((role) => ({ role, story_function: `Preserve the already-authored ${role} function in visible action.`, visible_behaviours: [], identity_mode: "VERIFIED_IDENTITY" })),
      social_dynamics: [],
    },
    environment_intelligence: {
      recognition_anchors: unique(scenes.flatMap((scene) => [scene.location?.name, ...list(scene.products).map((product) => product?.name), ...list(scene.reference_asset_ids)])),
      reconstruction_opportunities: takeWithFallback(scenes.flatMap((scene) => [scene.state_change, scene.location?.atmosphere]), ["Reveal depth and scale through the existing scene geography.", "Use authored light, atmosphere and material change to evolve the environment."], 2),
      scale_opportunities: takeWithFallback(scenes.map((scene) => scene.location?.scale), shots.map((shot) => shot.camera?.camera_distance), 1),
      sensory_contrasts: takeWithFallback(shots.flatMap((shot) => [shot.lighting?.contrast, shot.lighting?.colour, shot.audio?.source_sound]), ["Contrast motion against stillness and machinery against environment."], 1),
    },
    action_intelligence: {
      high_value_actions: highValueActions,
      static_behaviours_to_avoid: ["Decorative posing with no state change", "Repeated coverage that does not advance the visual question"],
      escalation_logic: [story.escalation, ...scenes.map((scene) => scene.state_change)].map(text).filter(Boolean).join(" ") || "Visible action escalates through the authored scene state changes until the final payoff.",
    },
    camera_intelligence: {
      principles,
      contrast_pairs: takeWithFallback(shots.flatMap((shot) => [shot.camera?.framing, shot.camera?.camera_distance, shot.camera?.movement_path]), ["Scale contrast between wide geography and closer proof detail."], 2),
      repetition_risks: ["Repeating the same camera platform would make the sequence feel generated.", "Repeating the same movement path without a new story cause would flatten escalation."],
    },
    wow_hypotheses: wowHypotheses,
    creative_threats: takeWithFallback(attentionRisks, list(review.craft_risks), 3),
  };
}
function cameraPlatform(camera = {}) {
  const value = normalized([camera.platform, camera.stabilization, camera.movement_path].join(" "));
  if (value.includes("aerial") || value.includes("helicopter mounted")) return "AERIAL_PLATFORM";
  if (value.includes("handheld")) return "HANDHELD";
  if (value.includes("gimbal") || value.includes("steadicam")) return "GIMBAL_STABILIZED";
  if ((/\bpan\b|\btilt\b/.test(value)) && (/\bfluid\b|\btripod\b/.test(value))) return "FLUID_HEAD_TRIPOD";
  if (/\b(dolly|track|truck)\b/.test(value)) return "DOLLY_TRACK";
  if (/\b(crane|jib)\b/.test(value)) return "CRANE_JIB";
  if (/locked|static|tripod|sticks/.test(value)) return "LOCKED_TRIPOD";
  return "CONTROLLED_CAMERA_SUPPORT";
}
function shotImpact(shot = {}, scene = {}, previousShot = null) {
  const action = text(shot.action);
  const closing = text(shot.frame_plan?.closing_frame);
  const focus = text(shot.camera?.focus_target || shot.camera?.focus);
  return {
    attention_mechanism: [text(shot.subject), action, focus].filter(Boolean).join(" — ") || "The visible subject action creates the immediate attention event.",
    foreground_event: text(shot.production_design?.props) || text(shot.subject),
    midground_event: action || text(scene.state_change),
    background_event: text(shot.production_design?.environment) || text(scene.location?.atmosphere),
    interaction: action || text(shot.performance),
    visual_question: `How will ${text(shot.subject) || "the active subject"} change the visible state through ${action || "the authored action"}?`,
    payoff_or_reveal: closing || text(shot.purpose) || text(scene.story_state_after),
    camera_contrast_from_previous: previousShot
      ? `Contrast the prior ${text(previousShot.camera?.framing) || "frame"} with ${text(shot.camera?.framing) || "this framing"} because the story state has changed.`
      : `Opening camera establishes ${text(shot.camera?.framing) || "the authored framing"} as the first visual question.`,
  };
}
function sceneImpact(scene = {}, previousScene = null) {
  const actions = list(scene.shots).map((shot) => text(shot.action)).filter(Boolean);
  const payoff = text(scene.tension?.payoff);
  return {
    attention_hook: text(scene.state_change) || text(scene.objective) || "The scene opens a new visual question through the authored state change.",
    action_escalation: [
      `Pressure moves from ${scene.tension?.pressure_before ?? "the prior level"} to ${scene.tension?.pressure_after ?? "the next level"}.`,
      ...actions,
    ].join(" "),
    environment_transformation: `${text(scene.story_state_before) || "The prior environment state"} changes into ${text(scene.story_state_after) || text(scene.location?.atmosphere) || "the authored next environment state"}.`,
    reveal_or_payoff: payoff && !/^not_/i.test(payoff) ? payoff : text(scene.story_state_after) || text(scene.state_change),
    novelty_from_previous_scene: previousScene
      ? `This scene changes from ${text(previousScene.story_state_after) || "the prior state"} to ${text(scene.state_change) || text(scene.story_state_after) || "a new authored state"}.`
      : `The opening scene establishes ${text(scene.story_state_before) || text(scene.location?.name) || "the initial authored world"} before the first state change.`,
  };
}
function buildImpactPlan(plan = {}, understanding = {}) {
  const scenes = list(plan.scenes);
  let previousShot = null;
  const enrichedScenes = scenes.map((scene, sceneIndex) => {
    const shots = list(scene.shots).map((shot) => {
      const enriched = {
        ...shot,
        camera: { ...object(shot.camera), platform: text(shot.camera?.platform) || cameraPlatform(shot.camera) },
        metadata: { ...object(shot.metadata), cinematic_impact: shotImpact(shot, scene, previousShot) },
      };
      previousShot = enriched;
      return enriched;
    });
    return {
      ...scene,
      shots,
      metadata: { ...object(scene.metadata), cinematic_impact: sceneImpact(scene, scenes[sceneIndex - 1]) },
    };
  });
  const story = object(plan.story);
  const concept = object(plan.concept);
  const wowMoments = enrichedScenes.slice(0, Math.min(enrichedScenes.length, 3)).map((scene, index) => ({
    scene_id: text(scene.id),
    setup: text(scene.story_state_before) || text(scene.objective),
    visual_payoff: text(scene.state_change) || text(scene.story_state_after),
    audience_response: text(scene.emotion) || text(concept.emotional_promise),
    production_mechanism: [
      text(scene.camera_style?.movement),
      text(scene.location?.atmosphere),
      text(list(scene.shots)[0]?.action),
    ].filter(Boolean).join("; ") || "The authored action, environment and camera state create the visible payoff.",
  }));
  return {
    ...plan,
    scenes: enrichedScenes,
    cinematic_understanding: understanding,
    cinematic_impact_contract: {
      contract: "CREATIVE_CINEMATIC_IMPACT_DIRECTION_V2",
      understanding_hash: understanding.understanding_hash,
      audience_attention_thesis: [concept.hook, story.audience_tension, story.observable_proof].map(text).filter(Boolean).join(" "),
      retention_strategy: [story.escalation, ...enrichedScenes.map((scene) => scene.state_change), story.resolution].map(text).filter(Boolean).join(" "),
      action_grammar: unique(enrichedScenes.flatMap((scene) => list(scene.shots).map((shot) => shot.action))).join(" → "),
      camera_grammar: unique(enrichedScenes.flatMap((scene) => list(scene.shots).map((shot) => `${text(shot.camera?.platform)}: ${text(shot.camera?.framing)}; ${text(shot.camera?.movement_path)}; ${text(shot.camera?.lens_intent)}`))).join(" | "),
      environment_transformation_thesis: enrichedScenes.map((scene) => `${text(scene.story_state_before)} → ${text(scene.story_state_after)}`).join(" | "),
      population_strategy: {
        required: understanding.human_ecosystem.required === true,
        minimum_scene_ratio: understanding.human_ecosystem.required === true ? 0.5 : 0,
        role_categories: list(understanding.human_ecosystem.role_categories).map((entry) => entry.role).filter(Boolean),
        reason: text(understanding.human_ecosystem.reason),
      },
      wow_moments: wowMoments,
    },
  };
}
export function bootstrapCinematicImpactFromPlan({ plan = {} } = {}) {
  const understandingSource = buildUnderstanding(plan);
  const understanding = {
    ...understandingSource,
    understanding_hash: digest(understandingSource),
  };
  return {
    contract: "CREATIVE_CINEMATIC_IMPACT_BOOTSTRAP_V1",
    understanding,
    plan: buildImpactPlan(plan, understanding),
    inference_executed: false,
  };
}

export const CreativeCinematicImpactBootstrapRuntime = Object.freeze({
  contract: "CREATIVE_CINEMATIC_IMPACT_BOOTSTRAP_V1",
  create: bootstrapCinematicImpactFromPlan,
});

export default CreativeCinematicImpactBootstrapRuntime;
