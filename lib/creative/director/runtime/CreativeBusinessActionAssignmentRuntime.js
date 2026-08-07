import crypto from "node:crypto";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeBusinessActionIntelligenceRuntime,
} from "./CreativeBusinessActionIntelligenceRuntime";

const CONTRACT = "CREATIVE_BUSINESS_ACTION_ASSIGNMENT_V1";
const OPERATION = "CREATIVE_BUSINESS_ACTION_ASSIGNMENT_V1";

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
      // Continue with next JSON candidate.
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
      shot_id: shot.id,
      shot_title: shot.title,
      purpose: shot.purpose,
      subject: shot.subject,
      action: shot.action,
      duration_seconds: shot.duration_seconds,
    })),
  );
}

function prompt({ input = {}, directed = {}, intelligence = {} } = {}) {
  const plan = object(directed.plan);
  return `
You are Avantiqo's advertising sequence architect. A senior strategist has already decided
what action, proof, human roles, communication and sound mean for this business. Assign
that intelligence to the exact approved scenes and shots BEFORE cinematography is designed.

Do not rewrite the approved concept, causal story, ids, ordering or durations. Do not choose
providers or write prompts. Your job is to make sure every shot has a commercial/story job
and that communication and sound are intentionally distributed across the film.

Return strict JSON only:
{
  "contract": "${CONTRACT}",
  "business_action_intelligence_hash": "exact supplied intelligence hash",
  "scene_assignments": [{
    "scene_id": "exact scene id",
    "attention_beat_ids": ["attention beat id"],
    "commercial_job": "what this scene changes in the viewer",
    "action_escalation_job": "how visible action advances here",
    "proof_job": "what belief is strengthened or NONE",
    "human_ecosystem_job": "what people do here or NONE",
    "environment_job": "how the physical world changes or proves value",
    "communication_job": "why language/text/silence is used here",
    "sound_job": "how music, effects, real sound and silence drive this scene",
    "shot_assignments": [{
      "shot_id": "exact shot id",
      "primary_function": "one allowed shot function",
      "secondary_functions": ["allowed shot function"],
      "attention_beat_id": "attention beat id",
      "action_ids": ["business action id"],
      "proof_ids": ["proof id"],
      "human_roles": ["role category"],
      "visible_change_required": "what must visibly change during this shot",
      "interaction_required": "who/what interacts and how or NONE",
      "foreground_job": "specific foreground event or NONE",
      "midground_job": "specific midground event or NONE",
      "background_job": "specific background event or NONE",
      "communication": {
        "mode": "VOICEOVER|PRESENTER|DIALOGUE|ON_SCREEN_TEXT|NONE",
        "message_job": "what this language beat contributes or NONE",
        "max_words": 0
      },
      "sound": {
        "music_energy_target": 0,
        "diegetic_priority": "specific real sound or NONE",
        "designed_sound_event": "specific designed event or NONE",
        "impact_required": false,
        "silence_or_dropout": false,
        "visual_sync": "what visible action/reveal the sound follows"
      },
      "novelty_from_previous_shot": "what is materially new",
      "audience_question_opened": "what makes the viewer want the next beat or NONE",
      "audience_payoff": "what belief/emotion/action is delivered by shot end"
    }]
  }]
}

RULES
- Use only shot functions from: ${JSON.stringify(CreativeBusinessActionIntelligenceRuntime.shot_functions)}.
- Every existing scene and every existing shot must appear exactly once.
- Every shot must have one primary function. Do not let most shots become generic DETAIL, TRANSITION or beauty coverage.
- The first shot must serve the intelligence opening function.
- Required shot functions in the intelligence must all appear in the film.
- Proof-required businesses must map proof ids to concrete shots where the proof can actually be seen.
- Action ids must only be assigned where the physical action can happen truthfully.
- When human_ecosystem.required is true, distribute meaningful human roles across the sequence; people cannot be decorative background with no function.
- Communication must follow communication_strategy. Do not automatically fill every shot with text or voice. Preserve silence where visuals/sound are stronger.
- Presenter, dialogue or voiceover must do a real job; never describe what the viewer already sees.
- Sound must follow sound_strategy and attention_curve. It should evolve through energy, real sound, impacts, transitions and silence/dropouts. Do not assign the same sound treatment to every shot.
- At least one shot near each major proof/wow hypothesis must have an explicit sonic or visual payoff.
- Novelty must come from action, function, social state, proof, environment, scale, sound or emotional consequence — not random camera variation.
- No provider prompts, no generation parameters, no hardcoded industry template.

BUSINESS ACTION INTELLIGENCE
${JSON.stringify(intelligence)}

APPROVED SHOT MAP
${JSON.stringify(flattenShots(plan))}

PROJECT
${JSON.stringify(input.project)}

BRIEF
${JSON.stringify(input.brief)}
`;
}

function validateAssignment(plan = {}, intelligence = {}, value = {}) {
  const source = object(value);
  const failures = [];
  if (source.contract !== CONTRACT) failures.push("BUSINESS_ACTION_ASSIGNMENT_CONTRACT_REQUIRED");
  if (text(source.business_action_intelligence_hash) !== text(intelligence.intelligence_hash)) {
    failures.push("BUSINESS_ACTION_ASSIGNMENT_INTELLIGENCE_HASH_MISMATCH");
  }

  const planScenes = list(plan.scenes);
  const assignments = list(source.scene_assignments);
  if (assignments.length !== planScenes.length) failures.push("BUSINESS_ACTION_ASSIGNMENT_SCENE_COUNT_MISMATCH");

  const allowedFunctions = CreativeBusinessActionIntelligenceRuntime.shot_functions;
  const seenScenes = new Set();
  const seenShots = new Set();
  const functions = new Set();
  const proofIds = new Set(list(intelligence.proof_model?.proof_types).map((item) => text(item.id)));
  const actionIds = new Set(list(intelligence.action_grammar?.primary_actions).map((item) => text(item.id)));
  const attentionIds = new Set(list(intelligence.attention_curve).map((item) => text(item.id)));

  assignments.forEach((sceneAssignment, sceneIndex) => {
    const expectedScene = planScenes[sceneIndex];
    const sceneId = text(sceneAssignment.scene_id);
    if (sceneId !== text(expectedScene?.id) || seenScenes.has(sceneId)) {
      failures.push(`BUSINESS_ACTION_ASSIGNMENT_SCENE_INVALID:${sceneIndex + 1}`);
    }
    seenScenes.add(sceneId);
    const shotAssignments = list(sceneAssignment.shot_assignments);
    const expectedShots = list(expectedScene?.shots);
    if (shotAssignments.length !== expectedShots.length) {
      failures.push(`BUSINESS_ACTION_ASSIGNMENT_SHOT_COUNT_MISMATCH:${sceneIndex + 1}`);
    }
    shotAssignments.forEach((assignment, shotIndex) => {
      const expectedShot = expectedShots[shotIndex];
      const shotId = text(assignment.shot_id);
      if (shotId !== text(expectedShot?.id) || seenShots.has(shotId)) {
        failures.push(`BUSINESS_ACTION_ASSIGNMENT_SHOT_INVALID:${sceneIndex + 1}:${shotIndex + 1}`);
      }
      seenShots.add(shotId);
      const primary = text(assignment.primary_function).toUpperCase();
      if (!allowedFunctions.includes(primary)) failures.push(`BUSINESS_ACTION_ASSIGNMENT_FUNCTION_INVALID:${shotId}`);
      functions.add(primary);
      for (const fn of list(assignment.secondary_functions)) {
        const normalizedFn = text(fn).toUpperCase();
        if (!allowedFunctions.includes(normalizedFn)) failures.push(`BUSINESS_ACTION_ASSIGNMENT_SECONDARY_FUNCTION_INVALID:${shotId}:${fn}`);
        functions.add(normalizedFn);
      }
      if (!attentionIds.has(text(assignment.attention_beat_id))) failures.push(`BUSINESS_ACTION_ASSIGNMENT_ATTENTION_BEAT_INVALID:${shotId}`);
      for (const id of list(assignment.proof_ids)) {
        if (!proofIds.has(text(id))) failures.push(`BUSINESS_ACTION_ASSIGNMENT_PROOF_INVALID:${shotId}:${id}`);
      }
      for (const id of list(assignment.action_ids)) {
        if (!actionIds.has(text(id))) failures.push(`BUSINESS_ACTION_ASSIGNMENT_ACTION_INVALID:${shotId}:${id}`);
      }
      if (text(assignment.visible_change_required).length < 12) failures.push(`BUSINESS_ACTION_ASSIGNMENT_VISIBLE_CHANGE_REQUIRED:${shotId}`);
      if (text(assignment.novelty_from_previous_shot).length < 12) failures.push(`BUSINESS_ACTION_ASSIGNMENT_NOVELTY_REQUIRED:${shotId}`);
      if (text(assignment.audience_payoff).length < 12) failures.push(`BUSINESS_ACTION_ASSIGNMENT_PAYOFF_REQUIRED:${shotId}`);
      const energy = finite(assignment.sound?.music_energy_target);
      if (energy === null || energy < 0 || energy > 100) failures.push(`BUSINESS_ACTION_ASSIGNMENT_SOUND_ENERGY_INVALID:${shotId}`);
      const maxWords = finite(assignment.communication?.max_words);
      if (maxWords === null || maxWords < 0 || maxWords > 80) failures.push(`BUSINESS_ACTION_ASSIGNMENT_WORD_LIMIT_INVALID:${shotId}`);
    });
  });

  const firstAssignment = assignments[0]?.shot_assignments?.[0];
  if (text(firstAssignment?.primary_function).toUpperCase() !== text(intelligence.shot_function_strategy?.opening_function).toUpperCase()) {
    failures.push("BUSINESS_ACTION_ASSIGNMENT_OPENING_FUNCTION_MISMATCH");
  }
  for (const required of list(intelligence.shot_function_strategy?.required_functions)) {
    if (!functions.has(text(required).toUpperCase())) failures.push(`BUSINESS_ACTION_ASSIGNMENT_REQUIRED_FUNCTION_MISSING:${required}`);
  }
  if (intelligence.proof_model?.required === true) {
    const mappedProofs = assignments.flatMap((scene) => list(scene.shot_assignments)).flatMap((shot) => list(shot.proof_ids)).map(text);
    const minimum = Number(intelligence.proof_model?.minimum_proof_moments || 1);
    if (new Set(mappedProofs.filter(Boolean)).size < Math.min(minimum, proofIds.size)) failures.push("BUSINESS_ACTION_ASSIGNMENT_PROOF_COVERAGE_TOO_LOW");
  }
  if (intelligence.human_ecosystem?.required === true) {
    const humanShots = assignments.flatMap((scene) => list(scene.shot_assignments)).filter((shot) => list(shot.human_roles).length > 0).length;
    const totalShots = seenShots.size;
    if (humanShots < Math.ceil(totalShots * 0.4)) failures.push("BUSINESS_ACTION_ASSIGNMENT_HUMAN_COVERAGE_TOO_LOW");
  }

  if (failures.length) {
    const error = new Error(`CREATIVE_BUSINESS_ACTION_ASSIGNMENT_INVALID:${failures.join("|")}`);
    error.failures = failures;
    throw error;
  }

  const normalized = {
    ...source,
    contract: CONTRACT,
    business_action_intelligence_hash: intelligence.intelligence_hash,
  };
  return {
    ...normalized,
    assignment_hash: digest(normalized),
  };
}

export async function createCreativeBusinessActionAssignment({ input = {}, directed = {}, intelligence = {} } = {}) {
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
      prompt: prompt({ input, directed, intelligence }),
    },
    metadata: {
      module: "CREATIVE",
      operation: OPERATION,
      creative_mission_id: mission.id || mission.creative_mission_id || null,
      creative_project_id: project.id,
    },
  });
  const output = normalizedReasoningOutput(result);
  if (!output) throw new Error("CREATIVE_BUSINESS_ACTION_ASSIGNMENT_JSON_REQUIRED");
  return {
    assignment: validateAssignment(directed.plan, intelligence, output),
    result,
  };
}

export const CreativeBusinessActionAssignmentRuntime = Object.freeze({
  contract: CONTRACT,
  operation: OPERATION,
  create: createCreativeBusinessActionAssignment,
  validate: validateAssignment,
});
