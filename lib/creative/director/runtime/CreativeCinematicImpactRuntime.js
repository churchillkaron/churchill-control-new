import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeUniversalTemporalDirectionRuntime,
} from "./CreativeUniversalTemporalDirectionRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.cinematic-impact.v1",
);
const CONTRACT = "CREATIVE_CINEMATIC_IMPACT_DIRECTION_V1";
const OPERATION = "CREATIVE_CINEMATIC_IMPACT_REVISION_V1";

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

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
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

function mergeImpactPlan(originalPlan = {}, revision = {}) {
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
        purpose: revisedShot.purpose || originalShot.purpose,
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

  return {
    ...originalPlan,
    scenes,
    cinematic_impact_contract: object(revision.cinematic_impact_contract),
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

function validateImpactPlan(plan = {}) {
  const failures = [];
  const contract = object(plan.cinematic_impact_contract);
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const duration = shots.reduce(
    (sum, shot) => sum + Number(shot.duration_seconds || 0),
    0,
  );

  const requireText = (value, code, minimum = 16) => {
    if (text(value).length < minimum) failures.push(code);
  };

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
  const minimumWowMoments = Math.max(2, Math.ceil(duration / 20));
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
  });

  if (failures.length) {
    const error = new Error(
      `CREATIVE_CINEMATIC_IMPACT_VALIDATION_FAILED:${failures.join("|")}`,
    );
    error.failures = failures;
    throw error;
  }

  return {
    contract: CONTRACT,
    passed: true,
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

function impactPrompt(input = {}, directed = {}) {
  const plan = object(directed.plan);
  const project = object(input.project);
  const brief = object(input.brief);
  const research =
    brief.metadata?.autonomous_research ||
    brief.metadata?.research ||
    directed.research ||
    null;

  return `
You are Avantiqo's final cinematic director, trailer editor, cinematographer,
production designer, action/blocking director and audience-attention strategist.
The concept and causal story are already approved. Do not replace them.
Your job is to turn the approved plan into world-class physical filmmaking that
makes a viewer stop, watch, feel escalation and say "wow" because of what visibly
happens on screen — not because the description uses expensive adjectives.

Return strict JSON only:
{
  "cinematic_impact_contract": {
    "contract": "${CONTRACT}",
    "audience_attention_thesis": "how the film earns attention visually and emotionally",
    "retention_strategy": "how curiosity, escalation and payoff keep attention across the full duration",
    "action_grammar": "how physical action and interaction evolve instead of static posing",
    "camera_grammar": "dynamic camera language with motivated contrast between shots; never one repeated move",
    "environment_transformation_thesis": "how the physical world is rebuilt, revealed, populated or transformed while preserving evidence-based recognition anchors",
    "population_strategy": {
      "required": true,
      "minimum_scene_ratio": 0.6,
      "role_categories": ["evidence-derived role category"],
      "reason": "why people make the world truthful, energetic or socially legible"
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
      "environment_transformation": "how the location/world changes or is newly reconstructed/revealed",
      "reveal_or_payoff": "what visual/emotional payoff lands",
      "novelty_from_previous_scene": "what is genuinely new here"
    },
    "shots": [{
      "id": "same shot id",
      "duration_seconds": 0,
      "title": "",
      "purpose": "",
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

NON-NEGOTIABLE FILMMAKING RULES
- Preserve the approved concept, story, scene ids, shot ids, scene order, shot order and every duration exactly.
- Preserve all technical generation services, capabilities, provider parameters, output specs, identity contracts, rights, source/reference assets, reuse policy and audio timing. Do not return or modify those fields.
- Do not write provider prompts. Return structured filmmaking decisions only.
- Every shot must contain visible action or meaningful interaction. Static posing and generic beauty coverage are forbidden unless a deliberately still beat is essential and contrasted by surrounding action.
- Build scenes with foreground, midground and background life. A physical/social/business experience must not look abandoned.
- Infer human roles dynamically from research and business truth. When the real experience depends on customers, guests, users, staff, hosts, crew, participants, community or operators, show those roles doing believable work or social behaviour. Do not hardcode a specific industry taxonomy.
- Supporting cast must be role-based, not invented named identities. Never impersonate a real person without verified identity evidence.
- Reconstruct, expand or transform environments when that creates the stronger film. Preserve evidence-based architectural/product/brand recognition anchors, but do not merely reproduce uploaded backgrounds or lock every shot to the same room.
- Every scene must introduce a new environment state, social state, action state, scale, reveal or emotional consequence.
- Camera language must be motivated by action. Vary framing, distance, lens intent, height, axis, movement path, movement speed, focus behaviour and stabilization according to story. Do not repeat the same push-in, orbit, dolly or generic floating move across the film.
- Use contrast: wide/close, still/kinetic, low/high, compression/depth, locked/released, subjective/objective, foreground occlusion/clean reveal — but only when motivated by story and physical action.
- The first seconds must contain a visual question, unusual action, powerful reveal, spatial surprise or emotionally magnetic human moment. No slow empty establishing shot unless it immediately transforms.
- Create multiple genuine wow moments distributed across the film. A wow moment must be a visible event or transformation, not the word "cinematic".
- Make human behaviour specific: entering, serving, reacting, exchanging, building, preparing, performing, celebrating, choosing, discovering, coordinating, moving through space, or other evidence-appropriate action. Avoid mannequin-like extras.
- When the environment is a venue/place, show how people activate it and how the space changes with action, light, scale and point of view. When the subject is another type of business/product/experience, derive the equivalent visible ecosystem from evidence.
- Do not copy a protected film, campaign, director or living artist style. Achieve elite craft through original direction, blocking, cinematography, editing, production design and sound logic.

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

async function reviseImpact(input = {}, directed = {}) {
  const project = object(input.project);
  const mission = object(input.mission);
  const result = await ServiceExecutionRuntime.execute({
    organization_id: input.organization_id,
    service_id: "ai.reasoning.execute",
    provider_id: null,
    category: "CREATIVE_DIRECTION",
    input: {
      quantity: 1,
      max_output_tokens: 18000,
      response_format: { type: "json_object" },
      prompt: impactPrompt(input, directed),
    },
    metadata: {
      module: "CREATIVE",
      operation: OPERATION,
      creative_mission_id: mission.id || mission.creative_mission_id || null,
      creative_project_id: project.id,
    },
  });
  const output = normalizedReasoningOutput(result);
  if (!output) throw new Error("CREATIVE_CINEMATIC_IMPACT_JSON_REQUIRED");
  const plan = mergeImpactPlan(directed.plan, output);
  const validation = validateImpactPlan(plan);
  return { plan, validation, result };
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
      const revised = await reviseImpact(input, directed);
      return {
        ...directed,
        plan: {
          ...revised.plan,
          validation_summary: {
            ...object(revised.plan.validation_summary),
            cinematic_impact: revised.validation,
          },
          production: {
            ...object(revised.plan.production),
            cinematic_impact_contract_required: true,
            cinematic_impact_validation_required: true,
            repetitive_camera_release_blocked: true,
            empty_world_release_blocked: true,
            actionless_shot_release_blocked: true,
          },
        },
        cinematic_impact_validation: revised.validation,
        usage: {
          ...object(directed.usage),
          cinematic_impact: revised.result?.usage || null,
        },
        billing: {
          ...object(directed.billing),
          cinematic_impact: revised.result?.billing || null,
        },
      };
    };
}

install();

export const CreativeCinematicImpactRuntime = Object.freeze({
  installed: true,
  contract: CONTRACT,
  operation: OPERATION,
  validate: validateImpactPlan,
  revise: reviseImpact,
  fingerprint: digest,
});
