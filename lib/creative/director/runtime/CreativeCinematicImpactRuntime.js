import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.cinematic-impact.v2",
);
const CONTRACT = "CREATIVE_CINEMATIC_IMPACT_DIRECTION_V2";
const UNDERSTANDING_CONTRACT = "CREATIVE_CINEMATIC_AUDIENCE_UNDERSTANDING_V1";
const CRITIQUE_CONTRACT = "CREATIVE_CINEMATIC_IMPACT_CRITIQUE_V1";
const UNDERSTANDING_OPERATION = "CREATIVE_CINEMATIC_AUDIENCE_UNDERSTANDING_V1";
const DESIGN_OPERATION = "CREATIVE_CINEMATIC_IMPACT_DESIGN_V2";
const CRITIQUE_OPERATION = "CREATIVE_CINEMATIC_IMPACT_CRITIQUE_V1";
const REPAIR_OPERATION = "CREATIVE_CINEMATIC_IMPACT_REPAIR_V1";
const MAX_REPAIR_ROUNDS = 2;

const CRITIQUE_SCORE_FIELDS = Object.freeze([
  "attention_hook",
  "retention",
  "story_clarity",
  "action_and_blocking",
  "human_world_truth",
  "environment_transformation",
  "camera_language",
  "emotional_escalation",
  "brand_truth",
  "wow_factor",
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

function normalized(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

async function executeReasoning({ input, operation, prompt, maxOutputTokens }) {
  const project = object(input.project);
  const mission = object(input.mission);
  const result = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens: maxOutputTokens,
      response_format: { type: "json_object" },
      prompt,
    },
    metadata: {
      module: "CREATIVE",
      operation,
      creative_mission_id: mission.id || mission.creative_mission_id || null,
      creative_project_id: project.id,
    },
  });
  const output = normalizedReasoningOutput(result);
  if (!output) throw new Error(`${operation}_JSON_REQUIRED`);
  return { output, result };
}

function projectResearch(input = {}, directed = {}) {
  const brief = object(input.brief);
  return (
    brief.metadata?.autonomous_research ||
    brief.metadata?.research ||
    directed.research ||
    null
  );
}

function understandingPrompt(input = {}, directed = {}) {
  const plan = object(directed.plan);
  const project = object(input.project);
  const brief = object(input.brief);
  const research = projectResearch(input, directed);

  return `
You are Avantiqo's audience strategist, behavioural creative director, film producer,
production designer and cinematographer. Before changing a single shot, understand why
this specific audience would stop, keep watching, believe the work and feel a genuine
visual payoff. Do not design the film yet. Build the intelligence the director will use.

Return strict JSON only:
{
  "contract": "${UNDERSTANDING_CONTRACT}",
  "audience_model": {
    "primary_audience": "specific evidence-derived audience",
    "current_state": "what they likely feel or assume before watching",
    "desired_state": "what they should feel, believe or want after watching",
    "attention_triggers": ["specific evidence-derived trigger"],
    "attention_risks": ["specific reason they would scroll away or stop caring"],
    "credibility_signals": ["visible proof that makes the film believable"],
    "aspiration_signals": ["what makes the experience desirable without becoming fake"],
    "emotional_sequence": ["ordered emotion"]
  },
  "human_ecosystem": {
    "required": true,
    "reason": "evidence-based reason people are or are not essential to the physical world",
    "role_categories": [{
      "role": "evidence-derived role category",
      "story_function": "why this role matters",
      "visible_behaviours": ["specific believable action"],
      "identity_mode": "VERIFIED_IDENTITY|GENERATED_SUPPORTING_CAST"
    }],
    "social_dynamics": ["interaction pattern that makes the world feel alive"]
  },
  "environment_intelligence": {
    "recognition_anchors": ["physical or brand truth that must remain recognisable"],
    "reconstruction_opportunities": ["how the environment can be rebuilt, expanded or transformed"],
    "scale_opportunities": ["how space, depth, density or geography can create impact"],
    "sensory_contrasts": ["light, texture, movement, sound or spatial contrast"]
  },
  "action_intelligence": {
    "high_value_actions": [{
      "action": "specific evidence-appropriate physical action",
      "why_it_matters": "attention, proof, emotion or story function",
      "interaction": "who or what changes because of it"
    }],
    "static_behaviours_to_avoid": ["behaviour that would make the film feel dead or generic"],
    "escalation_logic": "how visible action should grow or transform across the film"
  },
  "camera_intelligence": {
    "principles": ["story-motivated camera principle"],
    "contrast_pairs": ["motivated visual contrast such as scale, proximity, stillness or depth"],
    "repetition_risks": ["camera habit that would make the film feel generated or repetitive"]
  },
  "wow_hypotheses": [{
    "setup": "what expectation is created",
    "payoff": "specific visible event, reveal, transformation or human moment",
    "why_the_audience_cares": "psychological or emotional reason",
    "truth_anchor": "research, asset or business truth preventing empty spectacle"
  }],
  "creative_threats": ["specific failure mode that would make this project feel generic, empty or artificial"]
}

REASONING RULES
- Derive decisions from research, business truth, assets, audience and the approved concept. Do not use a canned industry template.
- If the real experience is social or operational, identify the human ecosystem needed to make it believable. Do not default to an empty physical world.
- If a supplied place or environment is important, identify recognition anchors but also how it can be reconstructed, expanded, re-lit, re-blocked or revealed from new spatial logic rather than copied as one static background.
- Attention must come from visible causality: action, interaction, contrast, revelation, transformation, scale, timing, emotional behaviour and credible proof.
- "Wow" must be earned by a specific visible event. Expensive adjectives, random VFX and generic camera movement are not wow moments.
- Camera ideas must come from story and physical action, not a fixed list of fashionable moves.
- Protect identity, rights, brand truth and factual accuracy.
- Do not imitate a protected film, campaign, director or living artist style.

APPROVED CONCEPT AND STORY
${JSON.stringify({
  concept: plan.concept,
  story: plan.story,
  selected_concept_id: plan.selected_concept_id,
  concept_council: plan.concept_council,
})}

CURRENT SCENES AND SHOTS
${JSON.stringify(plan.scenes)}

PROJECT
${JSON.stringify(project)}

BRIEF
${JSON.stringify(brief)}

RESEARCH
${JSON.stringify(research)}
`;
}

function validateUnderstanding(value = {}) {
  const failures = [];
  const source = object(value);
  const audience = object(source.audience_model);
  const humans = object(source.human_ecosystem);
  const environment = object(source.environment_intelligence);
  const action = object(source.action_intelligence);
  const camera = object(source.camera_intelligence);

  if (source.contract !== UNDERSTANDING_CONTRACT) {
    failures.push("UNDERSTANDING_CONTRACT_REQUIRED");
  }
  if (text(audience.primary_audience).length < 12) {
    failures.push("PRIMARY_AUDIENCE_UNDERSTANDING_REQUIRED");
  }
  if (text(audience.current_state).length < 20) {
    failures.push("AUDIENCE_CURRENT_STATE_REQUIRED");
  }
  if (text(audience.desired_state).length < 20) {
    failures.push("AUDIENCE_DESIRED_STATE_REQUIRED");
  }
  if (list(audience.attention_triggers).length < 3) {
    failures.push("AUDIENCE_ATTENTION_TRIGGERS_REQUIRED");
  }
  if (list(audience.attention_risks).length < 3) {
    failures.push("AUDIENCE_ATTENTION_RISKS_REQUIRED");
  }
  if (list(audience.credibility_signals).length < 2) {
    failures.push("AUDIENCE_CREDIBILITY_SIGNALS_REQUIRED");
  }
  if (list(audience.emotional_sequence).length < 3) {
    failures.push("AUDIENCE_EMOTIONAL_SEQUENCE_REQUIRED");
  }
  if (typeof humans.required !== "boolean") {
    failures.push("HUMAN_ECOSYSTEM_DECISION_REQUIRED");
  }
  if (text(humans.reason).length < 25) {
    failures.push("HUMAN_ECOSYSTEM_REASON_REQUIRED");
  }
  if (humans.required === true && list(humans.role_categories).length < 2) {
    failures.push("HUMAN_ECOSYSTEM_ROLE_DEPTH_REQUIRED");
  }
  if (list(environment.recognition_anchors).length < 1) {
    failures.push("ENVIRONMENT_RECOGNITION_ANCHORS_REQUIRED");
  }
  if (list(environment.reconstruction_opportunities).length < 2) {
    failures.push("ENVIRONMENT_RECONSTRUCTION_OPPORTUNITIES_REQUIRED");
  }
  if (list(action.high_value_actions).length < 3) {
    failures.push("HIGH_VALUE_ACTION_UNDERSTANDING_REQUIRED");
  }
  if (text(action.escalation_logic).length < 30) {
    failures.push("ACTION_ESCALATION_LOGIC_REQUIRED");
  }
  if (list(camera.principles).length < 3) {
    failures.push("CAMERA_INTELLIGENCE_REQUIRED");
  }
  if (list(camera.repetition_risks).length < 2) {
    failures.push("CAMERA_REPETITION_RISKS_REQUIRED");
  }
  if (list(source.wow_hypotheses).length < 3) {
    failures.push("WOW_HYPOTHESES_REQUIRED");
  }
  if (list(source.creative_threats).length < 3) {
    failures.push("CREATIVE_THREATS_REQUIRED");
  }

  if (failures.length) {
    const error = new Error(
      `CREATIVE_CINEMATIC_UNDERSTANDING_INVALID:${failures.join("|")}`,
    );
    error.failures = failures;
    throw error;
  }

  return {
    ...source,
    understanding_hash: digest(source),
  };
}

async function createUnderstanding(input = {}, directed = {}) {
  const execution = await executeReasoning({
    input,
    operation: UNDERSTANDING_OPERATION,
    prompt: understandingPrompt(input, directed),
    maxOutputTokens: 12000,
  });
  return {
    understanding: validateUnderstanding(execution.output),
    result: execution.result,
  };
}

function sceneIds(plan = {}) {
  return list(plan.scenes).map((scene) => text(scene.id));
}

function shotIds(scene = {}) {
  return list(scene.shots).map((shot) => text(shot.id));
}

function sameOrderedIds(original = [], revised = [], label) {
  if (original.length !== revised.length) {
    throw new Error(`CREATIVE_CINEMATIC_IMPACT_${label}_COUNT_CHANGED`);
  }
  for (let index = 0; index < original.length; index += 1) {
    if (text(original[index]) !== text(revised[index])) {
      throw new Error(`CREATIVE_CINEMATIC_IMPACT_${label}_ID_CHANGED:${index + 1}`);
    }
  }
}

function actorKey(actor) {
  if (typeof actor === "string") return normalized(actor);
  return normalized(
    actor?.id ||
    actor?.identity_profile_id ||
    actor?.name ||
    actor?.label ||
    actor?.role ||
    JSON.stringify(actor || {}),
  );
}

function mergeActors(original = [], revised = []) {
  const output = [];
  const seen = new Set();
  for (const actor of [...list(original), ...list(revised)]) {
    const key = actorKey(actor);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(actor);
  }
  return output;
}

function preserveGeneration(original = {}) {
  return {
    ...object(original),
  };
}

function mergeImpactPlan(originalPlan = {}, revision = {}, understanding = null) {
  const originalScenes = list(originalPlan.scenes);
  const revisedScenes = list(revision.scenes);
  sameOrderedIds(sceneIds(originalPlan), revisedScenes.map((scene) => scene.id), "SCENE");

  const scenes = originalScenes.map((originalScene, sceneIndex) => {
    const revisedScene = revisedScenes[sceneIndex];
    const originalShots = list(originalScene.shots);
    const revisedShots = list(revisedScene.shots);
    sameOrderedIds(
      shotIds(originalScene),
      revisedShots.map((shot) => shot.id),
      `SHOT_${sceneIndex + 1}`,
    );

    const shots = originalShots.map((originalShot, shotIndex) => {
      const revisedShot = revisedShots[shotIndex];
      if (
        finite(originalShot.duration_seconds) !==
        finite(revisedShot.duration_seconds)
      ) {
        throw new Error(
          `CREATIVE_CINEMATIC_IMPACT_SHOT_DURATION_CHANGED:${originalShot.id}`,
        );
      }
      return {
        ...originalShot,
        title: revisedShot.title || originalShot.title,
        purpose: originalShot.purpose,
        subject: revisedShot.subject || originalShot.subject,
        action: revisedShot.action || originalShot.action,
        performance: revisedShot.performance || originalShot.performance,
        performance_direction:
          Object.keys(object(revisedShot.performance_direction)).length
            ? revisedShot.performance_direction
            : originalShot.performance_direction,
        frame_plan:
          Object.keys(object(revisedShot.frame_plan)).length
            ? revisedShot.frame_plan
            : originalShot.frame_plan,
        opening_frame:
          Object.keys(object(revisedShot.opening_frame)).length
            ? revisedShot.opening_frame
            : originalShot.opening_frame,
        progression_frames:
          list(revisedShot.progression_frames).length
            ? revisedShot.progression_frames
            : originalShot.progression_frames,
        closing_frame:
          Object.keys(object(revisedShot.closing_frame)).length
            ? revisedShot.closing_frame
            : originalShot.closing_frame,
        camera:
          Object.keys(object(revisedShot.camera)).length
            ? revisedShot.camera
            : originalShot.camera,
        lighting:
          Object.keys(object(revisedShot.lighting)).length
            ? revisedShot.lighting
            : originalShot.lighting,
        production_design:
          Object.keys(object(revisedShot.production_design)).length
            ? revisedShot.production_design
            : originalShot.production_design,
        continuity:
          Object.keys(object(revisedShot.continuity)).length
            ? revisedShot.continuity
            : originalShot.continuity,
        actors: mergeActors(originalShot.actors, revisedShot.actors),
        location:
          Object.keys(object(revisedShot.location)).length
            ? revisedShot.location
            : originalShot.location,
        audio:
          Object.keys(object(revisedShot.audio)).length
            ? revisedShot.audio
            : originalShot.audio,
        transition_in:
          revisedShot.transition_in || originalShot.transition_in,
        transition_out:
          revisedShot.transition_out || originalShot.transition_out,
        negative_constraints: [
          ...new Set([
            ...list(originalShot.negative_constraints),
            ...list(revisedShot.negative_constraints),
          ].map(text).filter(Boolean)),
        ],
        known_failure_modes: [
          ...new Set([
            ...list(originalShot.known_failure_modes),
            ...list(revisedShot.known_failure_modes),
          ].map(text).filter(Boolean)),
        ],
        repair_instructions: [
          ...new Set([
            ...list(originalShot.repair_instructions),
            ...list(revisedShot.repair_instructions),
          ].map(text).filter(Boolean)),
        ],
        id: originalShot.id,
        duration_seconds: originalShot.duration_seconds,
        medium: originalShot.medium,
        primary_source_asset_id: originalShot.primary_source_asset_id,
        reference_assets: originalShot.reference_assets,
        reference_asset_ids: originalShot.reference_asset_ids,
        identity_requirements: originalShot.identity_requirements,
        product_requirements: originalShot.product_requirements,
        rights_requirements: originalShot.rights_requirements,
        reuse_policy: originalShot.reuse_policy,
        output_spec: originalShot.output_spec,
        generation: preserveGeneration(originalShot.generation),
        metadata: {
          ...object(originalShot.metadata),
          cinematic_impact: object(revisedShot.cinematic_impact),
        },
      };
    });

    if (
      finite(originalScene.duration_seconds) !==
      finite(revisedScene.duration_seconds)
    ) {
      throw new Error(
        `CREATIVE_CINEMATIC_IMPACT_SCENE_DURATION_CHANGED:${originalScene.id}`,
      );
    }

    return {
      ...originalScene,
      title: revisedScene.title || originalScene.title,
      objective: originalScene.objective,
      emotion: revisedScene.emotion || originalScene.emotion,
      location:
        Object.keys(object(revisedScene.location)).length
          ? revisedScene.location
          : originalScene.location,
      actors: mergeActors(originalScene.actors, revisedScene.actors),
      visual_style:
        Object.keys(object(revisedScene.visual_style)).length
          ? revisedScene.visual_style
          : originalScene.visual_style,
      camera_style:
        Object.keys(object(revisedScene.camera_style)).length
          ? revisedScene.camera_style
          : originalScene.camera_style,
      audio_style:
        Object.keys(object(revisedScene.audio_style)).length
          ? revisedScene.audio_style
          : originalScene.audio_style,
      id: originalScene.id,
      duration_seconds: originalScene.duration_seconds,
      story_state_before: originalScene.story_state_before,
      state_change: originalScene.state_change,
      story_state_after: originalScene.story_state_after,
      transition_logic: originalScene.transition_logic,
      products: originalScene.products,
      brand_rules: originalScene.brand_rules,
      reference_asset_ids: originalScene.reference_asset_ids,
      shots,
      metadata: {
        ...object(originalScene.metadata),
        cinematic_impact: object(revisedScene.cinematic_impact),
      },
    };
  });

  const contract = {
    ...object(revision.cinematic_impact_contract),
    contract: CONTRACT,
    understanding_hash:
      understanding?.understanding_hash ||
      revision.cinematic_impact_contract?.understanding_hash ||
      null,
  };

  return {
    ...originalPlan,
    scenes,
    cinematic_understanding: understanding || originalPlan.cinematic_understanding || null,
    cinematic_impact_contract: contract,
  };
}

function cameraSignature(shot = {}) {
  const camera = object(shot.camera);
  return [
    camera.framing,
    camera.angle,
    camera.camera_distance,
    camera.lens_intent,
    camera.movement_path,
    camera.focus_transition,
  ].map(normalized).filter(Boolean).join("|");
}

function environmentSignature(scene = {}) {
  const shotEnvironments = list(scene.shots)
    .map((shot) => text(shot.production_design?.environment))
    .filter(Boolean);
  return normalized([
    JSON.stringify(scene.location || {}),
    ...shotEnvironments,
  ].join("|"));
}

function roleValues(plan = {}) {
  return list(plan.scenes)
    .flatMap((scene) => [
      ...list(scene.actors),
      ...list(scene.shots).flatMap((shot) => list(shot.actors)),
    ])
    .map((actor) =>
      typeof actor === "string"
        ? actor
        : actor?.role || actor?.label || actor?.name || actor?.id,
    )
    .map(normalized)
    .filter(Boolean);
}

function evaluateImpactPlan(plan = {}) {
  const failures = [];
  const contract = object(plan.cinematic_impact_contract);
  const understanding = object(plan.cinematic_understanding);
  const humans = object(understanding.human_ecosystem);
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const duration = shots.reduce(
    (sum, shot) => sum + Number(shot.duration_seconds || 0),
    0,
  );

  const requireText = (value, code, minimum = 16) => {
    if (text(value).length < minimum) failures.push(code);
  };

  if (understanding.contract !== UNDERSTANDING_CONTRACT) {
    failures.push("CINEMATIC_UNDERSTANDING_REQUIRED");
  }
  if (
    text(contract.understanding_hash) !==
    text(understanding.understanding_hash)
  ) {
    failures.push("CINEMATIC_UNDERSTANDING_HASH_MISMATCH");
  }
  if (contract.contract !== CONTRACT) {
    failures.push("CINEMATIC_IMPACT_CONTRACT_REQUIRED");
  }
  requireText(
    contract.audience_attention_thesis,
    "AUDIENCE_ATTENTION_THESIS_REQUIRED",
    30,
  );
  requireText(
    contract.action_grammar,
    "ACTION_GRAMMAR_REQUIRED",
    30,
  );
  requireText(
    contract.camera_grammar,
    "CAMERA_GRAMMAR_REQUIRED",
    30,
  );
  requireText(
    contract.environment_transformation_thesis,
    "ENVIRONMENT_TRANSFORMATION_THESIS_REQUIRED",
    30,
  );
  requireText(
    contract.retention_strategy,
    "RETENTION_STRATEGY_REQUIRED",
    30,
  );

  const wowMoments = list(contract.wow_moments);
  const minimumWowMoments = scenes.length <= 1
    ? 1
    : Math.min(scenes.length, Math.max(2, Math.ceil(duration / 20)));
  if (wowMoments.length < minimumWowMoments) {
    failures.push(
      `INSUFFICIENT_WOW_MOMENTS:${wowMoments.length}:${minimumWowMoments}`,
    );
  }
  const validSceneIds = new Set(scenes.map((scene) => text(scene.id)));
  const wowSceneIds = [];
  wowMoments.forEach((moment, index) => {
    const sceneId = text(moment.scene_id);
    if (!validSceneIds.has(sceneId)) {
      failures.push(`WOW_MOMENT_SCENE_INVALID:${index + 1}`);
    }
    wowSceneIds.push(sceneId);
    requireText(moment.setup, `WOW_MOMENT_SETUP_REQUIRED:${index + 1}`, 16);
    requireText(
      moment.visual_payoff,
      `WOW_MOMENT_VISUAL_PAYOFF_REQUIRED:${index + 1}`,
      20,
    );
    requireText(
      moment.production_mechanism,
      `WOW_MOMENT_PRODUCTION_MECHANISM_REQUIRED:${index + 1}`,
      20,
    );
  });
  if (new Set(wowSceneIds.filter(Boolean)).size < minimumWowMoments) {
    failures.push("WOW_MOMENTS_MUST_OCCUR_IN_DISTINCT_SCENES");
  }

  const cameraSignatures = shots.map(cameraSignature).filter(Boolean);
  const movementPaths = shots
    .map((shot) => normalized(shot.camera?.movement_path))
    .filter(Boolean);
  const framings = shots
    .map((shot) => normalized(shot.camera?.framing))
    .filter(Boolean);
  const lensIntents = shots
    .map((shot) => normalized(shot.camera?.lens_intent))
    .filter(Boolean);
  const distinctCameraMinimum = Math.min(
    shots.length,
    Math.max(3, Math.ceil(shots.length * 0.6)),
  );
  if (new Set(cameraSignatures).size < distinctCameraMinimum) {
    failures.push(
      `CAMERA_SIGNATURE_DIVERSITY_TOO_LOW:${new Set(cameraSignatures).size}:${distinctCameraMinimum}`,
    );
  }
  const distinctMovementMinimum = Math.min(
    shots.length,
    Math.max(3, Math.ceil(shots.length * 0.35)),
  );
  if (new Set(movementPaths).size < distinctMovementMinimum) {
    failures.push(
      `CAMERA_MOVEMENT_DIVERSITY_TOO_LOW:${new Set(movementPaths).size}:${distinctMovementMinimum}`,
    );
  }
  const distinctFramingMinimum = Math.min(
    shots.length,
    Math.max(3, Math.ceil(shots.length * 0.3)),
  );
  if (new Set(framings).size < distinctFramingMinimum) {
    failures.push(
      `CAMERA_FRAMING_DIVERSITY_TOO_LOW:${new Set(framings).size}:${distinctFramingMinimum}`,
    );
  }
  if (shots.length >= 6 && new Set(lensIntents).size < 3) {
    failures.push("LENS_INTENT_DIVERSITY_TOO_LOW");
  }
  for (let index = 1; index < cameraSignatures.length; index += 1) {
    if (cameraSignatures[index] === cameraSignatures[index - 1]) {
      failures.push(`CONSECUTIVE_CAMERA_SIGNATURE_REPEATED:${index + 1}`);
    }
  }
  const movementCounts = movementPaths.reduce((map, value) => {
    map.set(value, Number(map.get(value) || 0) + 1);
    return map;
  }, new Map());
  const maximumRepeatedMove = Math.max(...movementCounts.values(), 0);
  if (
    shots.length >= 6 &&
    maximumRepeatedMove > Math.ceil(shots.length * 0.4)
  ) {
    failures.push(
      `DOMINANT_CAMERA_MOVE_REPEATED_TOO_OFTEN:${maximumRepeatedMove}:${shots.length}`,
    );
  }

  const actionSignatures = shots.map((shot) => normalized(shot.action));
  const uniqueActionMinimum = Math.min(
    shots.length,
    Math.max(3, Math.ceil(shots.length * 0.75)),
  );
  if (new Set(actionSignatures.filter(Boolean)).size < uniqueActionMinimum) {
    failures.push(
      `ACTION_DIVERSITY_TOO_LOW:${new Set(actionSignatures.filter(Boolean)).size}:${uniqueActionMinimum}`,
    );
  }
  shots.forEach((shot, index) => {
    if (text(shot.action).length < 24) {
      failures.push(`SHOT_ACTION_TOO_SHALLOW:${index + 1}`);
    }
    const opening = normalized(shot.frame_plan?.opening_frame);
    const progression = normalized(shot.frame_plan?.progression);
    const closing = normalized(shot.frame_plan?.closing_frame);
    if (!opening || !progression || !closing) {
      failures.push(`SHOT_TEMPORAL_PROGRESSION_REQUIRED:${index + 1}`);
    }
    if (opening && closing && opening === closing) {
      failures.push(`SHOT_OPENING_CLOSING_STATE_IDENTICAL:${index + 1}`);
    }
    const impact = object(shot.metadata?.cinematic_impact);
    requireText(
      impact.attention_mechanism,
      `SHOT_ATTENTION_MECHANISM_REQUIRED:${index + 1}`,
      16,
    );
    requireText(
      impact.visual_question,
      `SHOT_VISUAL_QUESTION_REQUIRED:${index + 1}`,
      16,
    );
    requireText(
      impact.payoff_or_reveal,
      `SHOT_PAYOFF_REQUIRED:${index + 1}`,
      16,
    );
  });

  const environments = scenes.map(environmentSignature).filter(Boolean);
  const environmentMinimum = Math.min(
    scenes.length,
    Math.max(2, Math.ceil(scenes.length * 0.5)),
  );
  if (new Set(environments).size < environmentMinimum) {
    failures.push(
      `ENVIRONMENT_STATE_DIVERSITY_TOO_LOW:${new Set(environments).size}:${environmentMinimum}`,
    );
  }

  const population = object(contract.population_strategy);
  if (population.required !== humans.required) {
    failures.push("POPULATION_STRATEGY_UNDERSTANDING_MISMATCH");
  }
  if (population.required === true) {
    const minimumSceneRatio = Math.max(
      0.5,
      Math.min(1, Number(population.minimum_scene_ratio || 0.5)),
    );
    const populatedScenes = scenes.filter((scene) =>
      list(scene.actors).length > 0 ||
      list(scene.shots).some((shot) => list(shot.actors).length > 0),
    ).length;
    const requiredScenes = Math.ceil(scenes.length * minimumSceneRatio);
    if (populatedScenes < requiredScenes) {
      failures.push(
        `POPULATED_SCENE_COVERAGE_TOO_LOW:${populatedScenes}:${requiredScenes}`,
      );
    }
    const roles = new Set(roleValues(plan));
    if (roles.size < 2) {
      failures.push("POPULATION_ROLE_VARIETY_REQUIRED");
    }
    if (list(population.role_categories).length < 2) {
      failures.push("POPULATION_STRATEGY_ROLE_CATEGORIES_REQUIRED");
    }
  }

  scenes.forEach((scene, index) => {
    const impact = object(scene.metadata?.cinematic_impact);
    requireText(
      impact.attention_hook,
      `SCENE_ATTENTION_HOOK_REQUIRED:${index + 1}`,
      16,
    );
    requireText(
      impact.action_escalation,
      `SCENE_ACTION_ESCALATION_REQUIRED:${index + 1}`,
      20,
    );
    requireText(
      impact.environment_transformation,
      `SCENE_ENVIRONMENT_TRANSFORMATION_REQUIRED:${index + 1}`,
      20,
    );
    requireText(
      impact.reveal_or_payoff,
      `SCENE_REVEAL_OR_PAYOFF_REQUIRED:${index + 1}`,
      16,
    );
    requireText(
      impact.novelty_from_previous_scene,
      `SCENE_NOVELTY_REQUIRED:${index + 1}`,
      16,
    );
  });

  return {
    contract: CONTRACT,
    passed: failures.length === 0,
    failures,
    scene_count: scenes.length,
    shot_count: shots.length,
    wow_moment_count: wowMoments.length,
    distinct_camera_signature_count: new Set(cameraSignatures).size,
    distinct_camera_movement_count: new Set(movementPaths).size,
    distinct_framing_count: new Set(framings).size,
    distinct_lens_intent_count: new Set(lensIntents).size,
    distinct_action_count: new Set(actionSignatures.filter(Boolean)).size,
    distinct_environment_state_count: new Set(environments).size,
    population_required: population.required === true,
    population_role_count: new Set(roleValues(plan)).size,
  };
}

function validateImpactPlan(plan = {}) {
  const validation = evaluateImpactPlan(plan);
  if (!validation.passed) {
    const error = new Error(
      `CREATIVE_CINEMATIC_IMPACT_VALIDATION_FAILED:${validation.failures.join("|")}`,
    );
    error.failures = validation.failures;
    error.validation = validation;
    throw error;
  }
  return validation;
}

function impactOutputSchema() {
  return `
{
  "cinematic_impact_contract": {
    "contract": "${CONTRACT}",
    "understanding_hash": "exact supplied understanding hash",
    "audience_attention_thesis": "how the film earns attention visually and emotionally",
    "retention_strategy": "how curiosity, escalation and payoff keep attention across the full duration",
    "action_grammar": "how physical action and interaction evolve instead of static posing",
    "camera_grammar": "dynamic camera language with motivated contrast between shots; never one repeated move",
    "environment_transformation_thesis": "how the physical world is reconstructed, revealed, populated or transformed while preserving recognition anchors",
    "population_strategy": {
      "required": true,
      "minimum_scene_ratio": 0.6,
      "role_categories": ["evidence-derived role category"],
      "reason": "why people are or are not required according to the supplied understanding"
    },
    "wow_moments": [{
      "scene_id": "existing scene id",
      "setup": "what visual expectation is created",
      "visual_payoff": "specific surprising or emotionally powerful visible payoff",
      "audience_response": "what the viewer should feel",
      "production_mechanism": "how action, environment, blocking, camera, light, VFX or edit creates the payoff"
    }]
  },
  "scenes": [{
    "id": "same scene id",
    "title": "",
    "duration_seconds": 0,
    "emotion": "",
    "location": {},
    "actors": [{
      "role": "evidence-derived human role",
      "function": "what this person contributes to visible story/action",
      "identity_source": "VERIFIED_IDENTITY|GENERATED_SUPPORTING_CAST",
      "count": 1,
      "behaviour": "specific physical behaviour"
    }],
    "visual_style": {},
    "camera_style": {},
    "audio_style": {},
    "cinematic_impact": {
      "attention_hook": "specific attention event",
      "action_escalation": "how action intensifies or changes",
      "environment_transformation": "how the physical world changes or is newly reconstructed/revealed",
      "reveal_or_payoff": "what visual/emotional payoff lands",
      "novelty_from_previous_scene": "what is genuinely new here"
    },
    "shots": [{
      "id": "same shot id",
      "duration_seconds": 0,
      "title": "",
      "subject": "exact visible subject including relevant people",
      "action": "specific physical action with beginning, change and result",
      "performance": "micro-behaviour and interaction",
      "performance_direction": {},
      "actors": [],
      "location": {},
      "frame_plan": {
        "opening_frame": "",
        "progression": "",
        "closing_frame": ""
      },
      "camera": {
        "framing": "",
        "angle": "",
        "camera_distance": "",
        "lens_intent": "",
        "movement_path": "",
        "movement_speed": "",
        "stabilization": "",
        "movement_motivation": "",
        "focus_target": "",
        "focus_transition": ""
      },
      "lighting": {},
      "production_design": {
        "environment": "",
        "wardrobe": "",
        "props": "",
        "materials": "",
        "texture_detail": ""
      },
      "continuity": {},
      "audio": {},
      "transition_in": "",
      "transition_out": "",
      "negative_constraints": [],
      "known_failure_modes": [],
      "repair_instructions": [],
      "cinematic_impact": {
        "attention_mechanism": "what catches the eye now",
        "foreground_event": "what happens closest to camera",
        "midground_event": "what happens around the subject",
        "background_event": "what makes the world feel alive",
        "interaction": "who or what interacts and how",
        "visual_question": "what makes the viewer want the next shot",
        "payoff_or_reveal": "what changes or lands by the end",
        "camera_contrast_from_previous": "why this shot feels visually different"
      }
    }]
  }]
}
`;
}

function filmmakingRules() {
  return `
NON-NEGOTIABLE FILMMAKING RULES
- Preserve the approved concept, causal story, scene ids, shot ids, scene order, shot order, scene objectives, causal state changes and every duration exactly.
- Preserve all technical generation services, capabilities, provider parameters, output specs, identity contracts, rights, source/reference assets, reuse policy and audio timing. Do not return or modify those fields.
- Do not write provider prompts. Return structured filmmaking decisions only.
- Use the audience understanding as the creative cause of every decision. Do not decorate the plan with generic cinematic language.
- Every shot must contain visible action or meaningful interaction. Static posing and generic beauty coverage are forbidden unless a deliberately still beat is essential and contrasted by surrounding action.
- Build scenes with foreground, midground and background life whenever the understanding says the human ecosystem is required.
- Derive human roles dynamically from research and business truth. Supporting cast is role-based, never invented named identities.
- Reconstruct, expand or transform physical environments when that creates the stronger film. Preserve evidence-based recognition anchors, but do not merely reproduce uploaded backgrounds or lock every shot to the same spatial treatment.
- Every scene must introduce a new environment state, social state, action state, scale, reveal or emotional consequence.
- Camera language must be motivated by action. Vary framing, distance, lens intent, height/angle, axis, movement path, movement speed, focus behaviour and stabilization according to story. Do not repeat the same push-in, orbit, dolly or generic floating move across the film.
- Use visual contrast only when motivated by story and physical action: scale, proximity, stillness, depth, occlusion, reveal, speed, perspective and focus should change because the scene changes.
- The first seconds must contain a visual question, unusual action, powerful reveal, spatial surprise or emotionally magnetic human moment. No slow empty establishing shot unless it transforms immediately.
- Create genuine wow moments appropriate to the approved duration and scene count. A wow moment is a visible event or transformation, not the word "cinematic".
- Make behaviour specific and consequential. People must affect objects, space, each other or the story state rather than exist as decorative extras.
- Do not copy a protected film, campaign, director or living artist style. Achieve elite craft through original direction, blocking, cinematography, editing, production design and sound logic.
`;
}

function designPrompt(input = {}, directed = {}, understanding = {}) {
  const plan = object(directed.plan);
  const project = object(input.project);
  const brief = object(input.brief);
  const research = projectResearch(input, directed);

  return `
You are Avantiqo's final cinematic director, trailer editor, cinematographer,
production designer and action/blocking director. The audience strategist has already
explained what will earn attention and belief. The concept and causal story are approved.
Now translate that understanding into executable physical filmmaking.

Return strict JSON only using this structure:
${impactOutputSchema()}

${filmmakingRules()}

CINEMATIC AUDIENCE UNDERSTANDING
${JSON.stringify(understanding)}

CURRENT APPROVED PLAN
${JSON.stringify(plan)}

PROJECT
${JSON.stringify(project)}

BRIEF
${JSON.stringify(brief)}

RESEARCH
${JSON.stringify(research)}
`;
}

async function createInitialDesign(input = {}, directed = {}, understanding = {}) {
  const execution = await executeReasoning({
    input,
    operation: DESIGN_OPERATION,
    prompt: designPrompt(input, directed, understanding),
    maxOutputTokens: 18000,
  });
  return {
    plan: mergeImpactPlan(directed.plan, execution.output, understanding),
    result: execution.result,
  };
}

function critiquePrompt({ input, plan, understanding, deterministic, round }) {
  const project = object(input.project);
  const brief = object(input.brief);
  const research = projectResearch(input, { plan });
  return `
You are an independent top-tier film audience panel: executive creative director,
trailer editor, cinematographer, production designer, performance director and a demanding
viewer with no obligation to praise the work. Evaluate whether this plan will actually
hold attention and create memorable visual/emotional payoff. Do not rewrite it in this pass.

Return strict JSON only:
{
  "contract": "${CRITIQUE_CONTRACT}",
  "round": ${round},
  "scores": {
    "attention_hook": 0,
    "retention": 0,
    "story_clarity": 0,
    "action_and_blocking": 0,
    "human_world_truth": 0,
    "environment_transformation": 0,
    "camera_language": 0,
    "emotional_escalation": 0,
    "brand_truth": 0,
    "wow_factor": 0
  },
  "overall_score": 0,
  "audience_simulation": {
    "first_3_seconds": "what the viewer notices and whether curiosity opens",
    "middle_retention": "where attention strengthens or collapses",
    "ending_memory": "what the viewer is likely to remember or feel",
    "would_share_or_rewatch": false,
    "why": "specific reason"
  },
  "strengths": [],
  "weaknesses": [{
    "severity": "CRITICAL|MAJOR|MINOR",
    "scope": "FILM|SCENE|SHOT",
    "id": "scene or shot id when applicable",
    "problem": "specific weakness",
    "audience_effect": "why it loses attention, belief or emotional force"
  }],
  "required_repairs": [{
    "scope": "FILM|SCENE|SHOT",
    "id": "scene or shot id when applicable",
    "problem": "specific problem",
    "required_change": "what the director must change physically",
    "reason": "why this change improves the audience response without changing the approved story"
  }],
  "fatal_contradictions": []
}

SCORING STANDARD
- This is a release decision for an elite original campaign/film, not a normal AI-video score.
- 90-100: exceptional, memorable, specific, controlled and emotionally effective.
- 85-89: strong professional work with no major weakness.
- 80-84: competent but not yet release-worthy for this standard.
- Below 80: weak or generic.
- Be severe on repetitive camera motion, static subjects, empty environments, decorative extras, unearned spectacle, weak first seconds, disconnected shots and generic AI aesthetics.
- A strong plan must convert the supplied audience understanding into visible choices. If the plan technically contains required fields but does not embody the understanding, score it down.
- Do not demand stylistic imitation of protected works or living artists.

DETERMINISTIC CRAFT FINDINGS
${JSON.stringify(deterministic.failures)}

AUDIENCE UNDERSTANDING
${JSON.stringify(understanding)}

PLAN TO REVIEW
${JSON.stringify(plan)}

PROJECT
${JSON.stringify(project)}

BRIEF
${JSON.stringify(brief)}

RESEARCH
${JSON.stringify(research)}
`;
}

function normalizeCritique(value = {}, round = 0) {
  const source = object(value);
  if (source.contract !== CRITIQUE_CONTRACT) {
    throw new Error("CREATIVE_CINEMATIC_CRITIQUE_CONTRACT_REQUIRED");
  }
  const scores = object(source.scores);
  const normalizedScores = {};
  for (const field of CRITIQUE_SCORE_FIELDS) {
    const score = finite(scores[field]);
    if (score === null || score < 0 || score > 100) {
      throw new Error(`CREATIVE_CINEMATIC_CRITIQUE_SCORE_INVALID:${field}`);
    }
    normalizedScores[field] = score;
  }
  const overall = finite(source.overall_score);
  if (overall === null || overall < 0 || overall > 100) {
    throw new Error("CREATIVE_CINEMATIC_CRITIQUE_OVERALL_INVALID");
  }
  const minimumCategory = Math.min(...Object.values(normalizedScores));
  const criticalWeaknesses = list(source.weaknesses).filter(
    (weakness) => text(weakness?.severity).toUpperCase() === "CRITICAL",
  );
  const requiredRepairs = list(source.required_repairs);
  const fatalContradictions = list(source.fatal_contradictions);
  const passed = Boolean(
    overall >= 88 &&
    minimumCategory >= 84 &&
    criticalWeaknesses.length === 0 &&
    fatalContradictions.length === 0 &&
    requiredRepairs.length === 0
  );

  return {
    ...source,
    contract: CRITIQUE_CONTRACT,
    round,
    scores: normalizedScores,
    overall_score: overall,
    minimum_category_score: minimumCategory,
    required_repairs: requiredRepairs,
    fatal_contradictions: fatalContradictions,
    critical_weakness_count: criticalWeaknesses.length,
    passed,
    critique_hash: digest(source),
  };
}

async function critiquePlan({ input, plan, understanding, deterministic, round }) {
  const execution = await executeReasoning({
    input,
    operation: CRITIQUE_OPERATION,
    prompt: critiquePrompt({ input, plan, understanding, deterministic, round }),
    maxOutputTokens: 9000,
  });
  return {
    critique: normalizeCritique(execution.output, round),
    result: execution.result,
  };
}

function repairPrompt({ input, plan, understanding, deterministic, critique, round }) {
  const project = object(input.project);
  const brief = object(input.brief);
  const research = projectResearch(input, { plan });
  return `
You are Avantiqo's senior film director returning to the cut after a failed internal review.
Do not merely acknowledge the notes. Solve them through stronger physical filmmaking while
preserving the approved concept and causal story. This is repair round ${round} of ${MAX_REPAIR_ROUNDS}.

Return strict JSON only using this structure:
${impactOutputSchema()}

${filmmakingRules()}

REPAIR RULES
- Resolve every deterministic finding and every required semantic repair unless they conflict with truth, rights, identity or the approved story.
- Do not make changes solely to game diversity counters. Every change must improve visible action, audience attention, credibility, emotion, spatial life or editorial progression.
- If camera repetition is weak, redesign the blocking and visual question first, then choose a camera treatment that expresses that new physical event.
- If the world feels empty, derive the correct human roles and behaviours from the supplied understanding; do not add decorative anonymous bodies with no story function.
- If a wow moment is weak, improve its setup/payoff causality and truth anchor rather than adding arbitrary spectacle.
- Preserve all ids, ordering, durations, technical generation configuration, asset bindings and rights exactly.

AUDIENCE UNDERSTANDING
${JSON.stringify(understanding)}

DETERMINISTIC FAILURES
${JSON.stringify(deterministic.failures)}

INDEPENDENT CRITIQUE
${JSON.stringify(critique)}

CURRENT FILM PLAN
${JSON.stringify(plan)}

PROJECT
${JSON.stringify(project)}

BRIEF
${JSON.stringify(brief)}

RESEARCH
${JSON.stringify(research)}
`;
}

async function repairPlan({ input, plan, understanding, deterministic, critique, round }) {
  const execution = await executeReasoning({
    input,
    operation: REPAIR_OPERATION,
    prompt: repairPrompt({ input, plan, understanding, deterministic, critique, round }),
    maxOutputTokens: 18000,
  });
  return {
    plan: mergeImpactPlan(plan, execution.output, understanding),
    result: execution.result,
  };
}

async function runDirectorLoop(input = {}, directed = {}) {
  const understandingRun = await createUnderstanding(input, directed);
  const understanding = understandingRun.understanding;
  const initial = await createInitialDesign(input, directed, understanding);
  let plan = initial.plan;
  const executionResults = [understandingRun.result, initial.result];
  const reviews = [];
  let finalValidation = null;
  let finalCritique = null;
  let repairsExecuted = 0;

  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round += 1) {
    const deterministic = evaluateImpactPlan(plan);
    const critiqueRun = await critiquePlan({
      input,
      plan,
      understanding,
      deterministic,
      round,
    });
    executionResults.push(critiqueRun.result);
    const critique = critiqueRun.critique;
    reviews.push({
      round,
      deterministic,
      critique,
    });

    if (deterministic.passed && critique.passed) {
      finalValidation = deterministic;
      finalCritique = critique;
      break;
    }

    if (round >= MAX_REPAIR_ROUNDS) {
      const error = new Error(
        `CREATIVE_CINEMATIC_IMPACT_NOT_WORLD_CLASS:round=${round}:deterministic=${deterministic.failures.join(",")}:semantic_score=${critique.overall_score}`,
      );
      error.deterministic = deterministic;
      error.critique = critique;
      error.reviews = reviews;
      throw error;
    }

    const repair = await repairPlan({
      input,
      plan,
      understanding,
      deterministic,
      critique,
      round: round + 1,
    });
    executionResults.push(repair.result);
    plan = repair.plan;
    repairsExecuted += 1;
  }

  if (!finalValidation || !finalCritique) {
    throw new Error("CREATIVE_CINEMATIC_IMPACT_FINAL_REVIEW_REQUIRED");
  }
  validateImpactPlan(plan);

  const reviewSummary = {
    contract: "CREATIVE_CINEMATIC_DIRECTOR_LOOP_V1",
    understanding_hash: understanding.understanding_hash,
    initial_design_executed: true,
    critique_rounds: reviews.length,
    repair_rounds: repairsExecuted,
    maximum_repair_rounds: MAX_REPAIR_ROUNDS,
    final_deterministic_passed: finalValidation.passed,
    final_semantic_passed: finalCritique.passed,
    final_semantic_score: finalCritique.overall_score,
    final_minimum_category_score: finalCritique.minimum_category_score,
    final_critique_hash: finalCritique.critique_hash,
    world_class_release_gate_passed: true,
  };

  return {
    plan: {
      ...plan,
      cinematic_understanding: understanding,
      cinematic_impact_review: reviewSummary,
      validation_summary: {
        ...object(plan.validation_summary),
        cinematic_impact: finalValidation,
        cinematic_impact_semantic_review: {
          contract: finalCritique.contract,
          passed: finalCritique.passed,
          overall_score: finalCritique.overall_score,
          minimum_category_score: finalCritique.minimum_category_score,
          critique_hash: finalCritique.critique_hash,
        },
      },
      production: {
        ...object(plan.production),
        cinematic_understanding_required: true,
        cinematic_impact_contract_required: true,
        cinematic_impact_validation_required: true,
        cinematic_impact_semantic_review_required: true,
        autonomous_cinematic_repair_required: true,
        repetitive_camera_release_blocked: true,
        empty_world_release_blocked: true,
        actionless_shot_release_blocked: true,
        world_class_release_gate_required: true,
      },
    },
    understanding,
    reviews,
    review_summary: reviewSummary,
    executions: executionResults,
  };
}

function install() {
  if (CreativeUniversalTemporalDirectionRuntime[INSTALL_FLAG]) return;
  const createWithoutImpact =
    CreativeUniversalTemporalDirectionRuntime.create.bind(
      CreativeUniversalTemporalDirectionRuntime,
    );

  Object.defineProperty(
    CreativeUniversalTemporalDirectionRuntime,
    INSTALL_FLAG,
    { value: true, enumerable: false, configurable: false },
  );

  CreativeUniversalTemporalDirectionRuntime.create =
    async function createWithCinematicImpact(input = {}) {
      const directed = await createWithoutImpact(input);
      if (!directed?.plan || directed.plan.workflow_kind !== "TEMPORAL") {
        return directed;
      }
      const loop = await runDirectorLoop(input, directed);
      const usages = loop.executions.map((result) => result?.usage).filter(Boolean);
      const billings = loop.executions.map((result) => result?.billing).filter(Boolean);
      return {
        ...directed,
        plan: loop.plan,
        cinematic_understanding: loop.understanding,
        cinematic_impact_validation: loop.plan.validation_summary?.cinematic_impact,
        cinematic_impact_review: loop.review_summary,
        usage: {
          ...object(directed.usage),
          cinematic_impact: usages,
        },
        billing: {
          ...object(directed.billing),
          cinematic_impact: billings,
        },
      };
    };
}

install();

export const CreativeCinematicImpactRuntime = Object.freeze({
  installed: true,
  contract: CONTRACT,
  understanding_contract: UNDERSTANDING_CONTRACT,
  critique_contract: CRITIQUE_CONTRACT,
  operations: Object.freeze({
    understanding: UNDERSTANDING_OPERATION,
    design: DESIGN_OPERATION,
    critique: CRITIQUE_OPERATION,
    repair: REPAIR_OPERATION,
  }),
  maximum_repair_rounds: MAX_REPAIR_ROUNDS,
  validateUnderstanding,
  evaluate: evaluateImpactPlan,
  validate: validateImpactPlan,
  run: runDirectorLoop,
  fingerprint: digest,
});