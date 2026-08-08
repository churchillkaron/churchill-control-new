import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const CONTRACT = "CREATIVE_COMMERCIAL_NARRATIVE_AUTHORITY_V1";
const OPERATION = "CREATIVE_COMMERCIAL_NARRATIVE_SYNTHESIS_V1";

const SCENE_ROLES = Object.freeze([
  "HOOK",
  "SETUP",
  "QUESTION",
  "ESCALATION",
  "PROOF",
  "REVERSAL",
  "REVEAL",
  "EMOTION",
  "TRANSFORMATION",
  "PAYOFF",
  "RESULT",
  "CTA",
  "TRANSITION",
]);

const CTA_MODES = Object.freeze([
  "DIRECT",
  "SOFT",
  "IMPLICIT",
  "NONE",
]);

const OPENING_ROLES = Object.freeze([
  "HOOK",
  "QUESTION",
  "SETUP",
  "REVEAL",
]);

const ENDING_ROLES = Object.freeze([
  "PAYOFF",
  "RESULT",
  "CTA",
  "EMOTION",
  "TRANSFORMATION",
]);

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function normalizedReasoningOutput(result = {}) {
  const value = result?.output?.output || result?.output || result || {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.result || value;
  }
  const source = text(value).replace(/^\uFEFF/, "");
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(source.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed.result || parsed;
      }
    } catch {
      // Continue with the next conservative JSON candidate.
    }
  }
  return null;
}

function flattenShots(plan = {}) {
  return list(plan.scenes).flatMap((scene) =>
    list(scene.shots).map((shot) => ({
      scene_id: scene.id,
      scene_title: scene.title,
      scene_objective: scene.objective,
      scene_emotion: scene.emotion,
      story_state_before:
        scene.story_state_before || scene.metadata?.story_state_before || null,
      state_change:
        scene.state_change || scene.metadata?.state_change || null,
      story_state_after:
        scene.story_state_after || scene.metadata?.story_state_after || null,
      shot_id: shot.id,
      shot_title: shot.title,
      shot_purpose: shot.purpose,
      shot_subject: shot.subject,
      shot_action: shot.action,
      duration_seconds: shot.duration_seconds,
      business_action: shot.metadata?.business_action || null,
    })),
  );
}

function prompt({ input = {}, directed = {} } = {}) {
  const plan = object(directed.plan);
  const intelligence = object(plan.business_action_intelligence);
  const assignment = object(plan.business_action_assignment);
  const singleScene = list(plan.scenes).length === 1;

  return `
You are Avantiqo's senior commercial storyteller, trailer story editor and advertising
narrative director. The canonical concept and causal story are already approved, and a
business strategist has already determined the real action, proof, audience, communication
and sound logic. Your task is NOT to invent a different story. Your task is to turn that
approved truth into a powerful commercial narrative arc that makes every scene and every
shot feel causally necessary.

Return strict JSON only:
{
  "contract": "${CONTRACT}",
  "business_action_intelligence_hash": "exact supplied hash",
  "business_action_assignment_hash": "exact supplied hash",
  "story_thesis": "one specific sentence describing what changes from beginning to end",
  "commercial_promise": "what the audience should ultimately believe, desire or do",
  "dramatic_question": "the question opened early that makes the audience need an answer",
  "narrative_mode": "evidence-derived narrative mode such as discovery, transformation, proof, journey, performance, participation, problem-solution, reveal or another justified mode",
  "emotional_progression": ["ordered emotional state"],
  "tension_engine": "what creates forward pressure without inventing false stakes",
  "payoff_principle": "how the ending pays off the opening question and the business promise",
  "cta_strategy": {
    "mode": "${CTA_MODES.join("|")}",
    "reason": "why this CTA strength is appropriate for the commercial objective",
    "message_job": "what the CTA must accomplish or NONE",
    "visual_or_language_expression": "how it should be expressed without becoming generic or pushy"
  },
  "open_loops": [{
    "id": "stable loop id",
    "opens_in_scene_id": "scene id",
    "question": "specific unresolved visual/emotional/commercial question",
    "must_resolve_by_scene_id": "scene id",
    "resolution": "what visible/action/proof payoff resolves it"
  }],
  "narrative_curve": [{
    "id": "stable curve beat id",
    "start_ratio": 0.0,
    "end_ratio": 0.2,
    "story_job": "what changes narratively in this interval",
    "audience_state_before": "what the viewer currently assumes or feels",
    "audience_state_after": "what changes in the viewer",
    "pressure": 0,
    "required_scene_roles": ["HOOK"],
    "action_job": "how physical action advances the story",
    "proof_job": "how belief advances or NONE",
    "communication_job": "what speech/text/silence contributes",
    "sound_job": "how music/sound/silence increases story pressure or payoff"
  }],
  "scene_arcs": [{
    "scene_id": "exact scene id",
    "primary_role": "one scene role",
    "secondary_roles": ["scene role"],
    "narrative_job": "why this scene must exist",
    "audience_state_before": "viewer state entering the scene",
    "audience_state_after": "viewer state leaving the scene",
    "tension_or_question": "what is unresolved during this scene or NONE",
    "causal_link_from_previous": "why this follows the previous scene or OPENING",
    "causal_link_to_next": "what forces or motivates the next scene or CLOSURE",
    "action_payoff": "what physical action changes the story",
    "proof_payoff": "what belief is proven or NONE",
    "emotional_turn": "what emotional shift occurs",
    "communication_job": "how presenter/voice/dialogue/text/silence serves this beat",
    "sound_story_job": "how music, real sound, designed sound or silence serves this beat",
    "open_loop_ids": ["loop id"],
    "resolved_loop_ids": ["loop id"],
    "shot_arcs": [{
      "shot_id": "exact shot id",
      "narrative_function": "specific story function of this shot",
      "event": "what visibly happens",
      "cause": "what causes this event",
      "consequence": "what changes because of it",
      "audience_question": "what question this opens or advances or NONE",
      "audience_payoff": "what the viewer receives by shot end",
      "action_requirement": "what must physically happen",
      "proof_requirement": "what must be visibly proven or NONE",
      "communication_function": "what language/text/silence does or NONE",
      "sound_function": "what sonic event/energy/silence does for the story",
      "opens_loop_ids": ["loop id"],
      "resolves_loop_ids": ["loop id"]
    }]
  }]
}

SCENE ROLE VOCABULARY
${JSON.stringify(SCENE_ROLES)}

CTA MODE VOCABULARY
${JSON.stringify(CTA_MODES)}

NON-NEGOTIABLE STORY RULES
- Preserve the approved canonical concept and story. Do not replace the premise, business truth, scene ids, shot ids, order, timing, source assets, rights or technical generation configuration.
- Every scene and every shot must appear exactly once.
- The first scene must create an immediate reason to continue: a question, desire, proof gap, transformation setup, emotional magnet or other evidence-based hook.
- ${singleScene
    ? "This is a single-scene film. The one scene must carry both an opening role and an ending/payoff role across primary_role plus secondary_roles; do not invent a second scene merely to satisfy role separation."
    : "Keep opening and ending scene functions distributed across the actual approved scene sequence."}
- The middle must genuinely progress. Do not create a montage where shots are individually attractive but interchangeable.
- Every shot must contain cause and consequence. Even a deliberately quiet detail shot must change knowledge, emotion, proof, expectation or story state.
- Use the business_action_intelligence and business_action_assignment as mandatory commercial truth. Do not ignore assigned action, proof, human, communication or sound jobs.
- Strong story does not require fake conflict. Tension can come from curiosity, anticipation, transformation, proof, risk, choice, social energy, performance, discovery, craft, scale or emotional expectation when supported by evidence.
- Proof moments must resolve real audience doubts. Wow moments must pay off setup rather than appear as disconnected spectacle.
- Communication mode is already strategically chosen. Narrative must decide what the words DO, not automatically add more words.
- Sound is part of story causality. Music energy, effects, real sound, impacts and silence should change because the narrative pressure or payoff changes.
- The ending must answer the opening dramatic question and land the commercial promise. CTA strength must fit the objective; not every film needs a hard sell.
- Do not copy a protected film, campaign, character, director or living artist style.
- Do not write provider prompts or provider-specific parameters.

CANONICAL STORY
${JSON.stringify({
  concept: plan.concept,
  story: plan.story,
  story_architecture: plan.story_architecture,
  selected_concept_id: plan.selected_concept_id,
  concept_council: plan.concept_council,
})}

BUSINESS ACTION INTELLIGENCE
${JSON.stringify(intelligence)}

BUSINESS ACTION ASSIGNMENT
${JSON.stringify(assignment)}

SCENE AND SHOT MAP
${JSON.stringify(flattenShots(plan))}

PROJECT
${JSON.stringify(input.project)}

BRIEF
${JSON.stringify(input.brief)}
`;
}

function validateContinuousCurve(curve = []) {
  const failures = [];
  const beats = list(curve);
  if (beats.length < 3) {
    failures.push("COMMERCIAL_NARRATIVE_CURVE_DEPTH_REQUIRED");
    return failures;
  }
  let previousEnd = 0;
  beats.forEach((beat, index) => {
    const start = finite(beat.start_ratio);
    const end = finite(beat.end_ratio);
    if (start === null || end === null || start < 0 || end > 1 || end <= start) {
      failures.push(`COMMERCIAL_NARRATIVE_CURVE_RANGE_INVALID:${index + 1}`);
      return;
    }
    if (Math.abs(start - previousEnd) > 0.0001) {
      failures.push(`COMMERCIAL_NARRATIVE_CURVE_GAP_OR_OVERLAP:${index + 1}`);
    }
    previousEnd = end;
    const pressure = finite(beat.pressure);
    if (pressure === null || pressure < 0 || pressure > 100) {
      failures.push(`COMMERCIAL_NARRATIVE_PRESSURE_INVALID:${index + 1}`);
    }
    if (text(beat.story_job).length < 20) {
      failures.push(`COMMERCIAL_NARRATIVE_CURVE_STORY_JOB_REQUIRED:${index + 1}`);
    }
  });
  if (Math.abs(previousEnd - 1) > 0.0001) {
    failures.push("COMMERCIAL_NARRATIVE_CURVE_MUST_END_AT_ONE");
  }
  return failures;
}

function validateNarrative(plan = {}, value = {}) {
  const source = object(value);
  const failures = [];
  const intelligence = object(plan.business_action_intelligence);
  const assignment = object(plan.business_action_assignment);
  const scenes = list(plan.scenes);
  const requireText = (input, code, minimum = 16) => {
    if (text(input).length < minimum) failures.push(code);
  };

  if (source.contract !== CONTRACT) failures.push("COMMERCIAL_NARRATIVE_CONTRACT_REQUIRED");
  if (text(source.business_action_intelligence_hash) !== text(intelligence.intelligence_hash)) {
    failures.push("COMMERCIAL_NARRATIVE_INTELLIGENCE_HASH_MISMATCH");
  }
  if (text(source.business_action_assignment_hash) !== text(assignment.assignment_hash)) {
    failures.push("COMMERCIAL_NARRATIVE_ASSIGNMENT_HASH_MISMATCH");
  }
  requireText(source.story_thesis, "COMMERCIAL_NARRATIVE_STORY_THESIS_REQUIRED", 30);
  requireText(source.commercial_promise, "COMMERCIAL_NARRATIVE_PROMISE_REQUIRED", 24);
  requireText(source.dramatic_question, "COMMERCIAL_NARRATIVE_DRAMATIC_QUESTION_REQUIRED", 20);
  requireText(source.narrative_mode, "COMMERCIAL_NARRATIVE_MODE_REQUIRED", 8);
  requireText(source.tension_engine, "COMMERCIAL_NARRATIVE_TENSION_ENGINE_REQUIRED", 24);
  requireText(source.payoff_principle, "COMMERCIAL_NARRATIVE_PAYOFF_PRINCIPLE_REQUIRED", 24);
  if (list(source.emotional_progression).length < 3) {
    failures.push("COMMERCIAL_NARRATIVE_EMOTIONAL_PROGRESSION_REQUIRED");
  }

  const cta = object(source.cta_strategy);
  const ctaMode = text(cta.mode).toUpperCase();
  if (!CTA_MODES.includes(ctaMode)) failures.push("COMMERCIAL_NARRATIVE_CTA_MODE_INVALID");
  requireText(cta.reason, "COMMERCIAL_NARRATIVE_CTA_REASON_REQUIRED", 20);
  if (ctaMode !== "NONE") {
    requireText(cta.message_job, "COMMERCIAL_NARRATIVE_CTA_JOB_REQUIRED", 12);
    requireText(cta.visual_or_language_expression, "COMMERCIAL_NARRATIVE_CTA_EXPRESSION_REQUIRED", 12);
  }

  failures.push(...validateContinuousCurve(source.narrative_curve));

  const loops = list(source.open_loops);
  const loopIds = new Set();
  loops.forEach((loop, index) => {
    const id = text(loop.id);
    if (!id || loopIds.has(id)) failures.push(`COMMERCIAL_NARRATIVE_LOOP_ID_INVALID:${index + 1}`);
    loopIds.add(id);
    requireText(loop.question, `COMMERCIAL_NARRATIVE_LOOP_QUESTION_REQUIRED:${index + 1}`, 16);
    requireText(loop.resolution, `COMMERCIAL_NARRATIVE_LOOP_RESOLUTION_REQUIRED:${index + 1}`, 16);
  });
  if (!loops.length) failures.push("COMMERCIAL_NARRATIVE_OPEN_LOOP_REQUIRED");

  const sceneArcs = list(source.scene_arcs);
  if (sceneArcs.length !== scenes.length) {
    failures.push("COMMERCIAL_NARRATIVE_SCENE_COUNT_MISMATCH");
  }
  const seenScenes = new Set();
  const seenShots = new Set();
  const seenRoles = new Set();
  const resolvedLoops = new Set();

  sceneArcs.forEach((arc, sceneIndex) => {
    const scene = scenes[sceneIndex];
    const sceneId = text(arc.scene_id);
    if (sceneId !== text(scene?.id) || seenScenes.has(sceneId)) {
      failures.push(`COMMERCIAL_NARRATIVE_SCENE_ID_INVALID:${sceneIndex + 1}`);
    }
    seenScenes.add(sceneId);
    const primaryRole = text(arc.primary_role).toUpperCase();
    if (!SCENE_ROLES.includes(primaryRole)) {
      failures.push(`COMMERCIAL_NARRATIVE_SCENE_ROLE_INVALID:${sceneId}`);
    }
    seenRoles.add(primaryRole);
    for (const role of list(arc.secondary_roles).map((item) => text(item).toUpperCase())) {
      if (!SCENE_ROLES.includes(role)) {
        failures.push(`COMMERCIAL_NARRATIVE_SECONDARY_SCENE_ROLE_INVALID:${sceneId}:${role}`);
      }
      seenRoles.add(role);
    }
    requireText(arc.narrative_job, `COMMERCIAL_NARRATIVE_SCENE_JOB_REQUIRED:${sceneId}`, 20);
    requireText(arc.audience_state_before, `COMMERCIAL_NARRATIVE_SCENE_AUDIENCE_BEFORE_REQUIRED:${sceneId}`, 16);
    requireText(arc.audience_state_after, `COMMERCIAL_NARRATIVE_SCENE_AUDIENCE_AFTER_REQUIRED:${sceneId}`, 16);
    requireText(arc.causal_link_from_previous, `COMMERCIAL_NARRATIVE_CAUSAL_FROM_REQUIRED:${sceneId}`, 8);
    requireText(arc.causal_link_to_next, `COMMERCIAL_NARRATIVE_CAUSAL_TO_REQUIRED:${sceneId}`, 8);
    requireText(arc.action_payoff, `COMMERCIAL_NARRATIVE_ACTION_PAYOFF_REQUIRED:${sceneId}`, 12);
    requireText(arc.emotional_turn, `COMMERCIAL_NARRATIVE_EMOTIONAL_TURN_REQUIRED:${sceneId}`, 12);
    requireText(arc.sound_story_job, `COMMERCIAL_NARRATIVE_SOUND_JOB_REQUIRED:${sceneId}`, 12);

    for (const id of list(arc.open_loop_ids)) {
      if (!loopIds.has(text(id))) failures.push(`COMMERCIAL_NARRATIVE_SCENE_LOOP_INVALID:${sceneId}:${id}`);
    }
    for (const id of list(arc.resolved_loop_ids)) {
      if (!loopIds.has(text(id))) failures.push(`COMMERCIAL_NARRATIVE_SCENE_RESOLUTION_INVALID:${sceneId}:${id}`);
      resolvedLoops.add(text(id));
    }

    const shots = list(scene?.shots);
    const shotArcs = list(arc.shot_arcs);
    if (shotArcs.length !== shots.length) {
      failures.push(`COMMERCIAL_NARRATIVE_SHOT_COUNT_MISMATCH:${sceneId}`);
    }
    shotArcs.forEach((shotArc, shotIndex) => {
      const shot = shots[shotIndex];
      const shotId = text(shotArc.shot_id);
      if (shotId !== text(shot?.id) || seenShots.has(shotId)) {
        failures.push(`COMMERCIAL_NARRATIVE_SHOT_ID_INVALID:${sceneId}:${shotIndex + 1}`);
      }
      seenShots.add(shotId);
      requireText(shotArc.narrative_function, `COMMERCIAL_NARRATIVE_SHOT_FUNCTION_REQUIRED:${shotId}`, 10);
      requireText(shotArc.event, `COMMERCIAL_NARRATIVE_SHOT_EVENT_REQUIRED:${shotId}`, 12);
      requireText(shotArc.cause, `COMMERCIAL_NARRATIVE_SHOT_CAUSE_REQUIRED:${shotId}`, 10);
      requireText(shotArc.consequence, `COMMERCIAL_NARRATIVE_SHOT_CONSEQUENCE_REQUIRED:${shotId}`, 10);
      requireText(shotArc.audience_payoff, `COMMERCIAL_NARRATIVE_SHOT_PAYOFF_REQUIRED:${shotId}`, 10);
      requireText(shotArc.action_requirement, `COMMERCIAL_NARRATIVE_SHOT_ACTION_REQUIRED:${shotId}`, 10);
      requireText(shotArc.sound_function, `COMMERCIAL_NARRATIVE_SHOT_SOUND_REQUIRED:${shotId}`, 8);
      for (const id of [...list(shotArc.opens_loop_ids), ...list(shotArc.resolves_loop_ids)]) {
        if (!loopIds.has(text(id))) failures.push(`COMMERCIAL_NARRATIVE_SHOT_LOOP_INVALID:${shotId}:${id}`);
      }
      for (const id of list(shotArc.resolves_loop_ids)) resolvedLoops.add(text(id));
    });
  });

  if (seenRoles.size < Math.min(3, scenes.length)) {
    failures.push("COMMERCIAL_NARRATIVE_SCENE_ROLE_DIVERSITY_TOO_LOW");
  }

  const firstArc = object(sceneArcs[0]);
  const lastArc = object(sceneArcs.at(-1));
  if (scenes.length === 1) {
    const singleSceneRoles = new Set([
      text(firstArc.primary_role).toUpperCase(),
      ...list(firstArc.secondary_roles).map((role) => text(role).toUpperCase()),
    ].filter(Boolean));
    if (!OPENING_ROLES.some((role) => singleSceneRoles.has(role))) {
      failures.push("COMMERCIAL_NARRATIVE_OPENING_ROLE_WEAK");
    }
    if (!ENDING_ROLES.some((role) => singleSceneRoles.has(role))) {
      failures.push("COMMERCIAL_NARRATIVE_ENDING_ROLE_WEAK");
    }
  } else {
    const firstRole = text(firstArc.primary_role).toUpperCase();
    if (!OPENING_ROLES.includes(firstRole)) {
      failures.push("COMMERCIAL_NARRATIVE_OPENING_ROLE_WEAK");
    }
    const lastRole = text(lastArc.primary_role).toUpperCase();
    if (!ENDING_ROLES.includes(lastRole)) {
      failures.push("COMMERCIAL_NARRATIVE_ENDING_ROLE_WEAK");
    }
  }

  for (const id of loopIds) {
    if (!resolvedLoops.has(id)) failures.push(`COMMERCIAL_NARRATIVE_LOOP_UNRESOLVED:${id}`);
  }

  if (failures.length) {
    const error = new Error(`CREATIVE_COMMERCIAL_NARRATIVE_INVALID:${failures.join("|")}`);
    error.failures = failures;
    throw error;
  }

  const normalized = {
    ...source,
    contract: CONTRACT,
    business_action_intelligence_hash: intelligence.intelligence_hash,
    business_action_assignment_hash: assignment.assignment_hash,
    scene_role_vocabulary: SCENE_ROLES,
    cta_mode_vocabulary: CTA_MODES,
  };
  return {
    ...normalized,
    narrative_hash: digest(normalized),
  };
}

export async function createCreativeCommercialNarrative({
  input = {},
  directed = {},
} = {}) {
  const project = object(input.project);
  const mission = object(input.mission);
  const plan = object(directed.plan);
  if (!input.organization_id) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");
  if (!plan.business_action_intelligence?.intelligence_hash) {
    throw new Error("CREATIVE_COMMERCIAL_NARRATIVE_BUSINESS_INTELLIGENCE_REQUIRED");
  }
  if (!plan.business_action_assignment?.assignment_hash) {
    throw new Error("CREATIVE_COMMERCIAL_NARRATIVE_BUSINESS_ASSIGNMENT_REQUIRED");
  }

  const result = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens: 18000,
      response_format: { type: "json_object" },
      prompt: prompt({ input, directed }),
    },
    metadata: {
      module: "CREATIVE",
      operation: OPERATION,
      creative_mission_id: mission.id || mission.creative_mission_id || null,
      creative_project_id: project.id,
    },
  });

  const output = normalizedReasoningOutput(result);
  if (!output) throw new Error("CREATIVE_COMMERCIAL_NARRATIVE_JSON_REQUIRED");
  return {
    narrative: validateNarrative(plan, output),
    result,
  };
}

export const CreativeCommercialNarrativeRuntime = Object.freeze({
  contract: CONTRACT,
  operation: OPERATION,
  scene_roles: SCENE_ROLES,
  cta_modes: CTA_MODES,
  create: createCreativeCommercialNarrative,
  validate: validateNarrative,
});
