import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CREATIVE_CINEMATIC_COVERAGE_CONTRACT,
} from "@/lib/creative/director/runtime/CreativeCinematicCoverageRuntime";

const AUTHORING_CONTRACT = "AVANTIQO_CINEMATIC_COVERAGE_AUTHORING_V1";
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
    "continuity_strategy": "how eyelines, screen direction, entrances/exits and spatial logic stay legible"
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
      "reestablish_strategy": "how geography is re-established after any deliberate disruption"
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
        "directorial_reasoning": "why this exact coverage choice is stronger for this story beat than competent generic coverage"
      }
    }]
  }]
}

NON-NEGOTIABLE RULES
- Use every existing scene id exactly once and every existing shot id exactly once. Never invent or rename ids.
- Do not add, remove, reorder or rewrite scenes or shots. Return coverage only.
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
