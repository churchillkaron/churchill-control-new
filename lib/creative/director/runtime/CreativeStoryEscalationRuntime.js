import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_STORY_ESCALATION_V2";
const SCENE_CONTRACT = "AVANTIQO_STORY_ESCALATION_SCENE_V2";
const SHOT_CONTRACT = "AVANTIQO_STORY_ESCALATION_SHOT_V2";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !["contract_hash", "graph_hash"].includes(key))
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function requireText(value, code) {
  const normalized = text(value);
  if (!normalized) throw new Error(code);
  return normalized;
}

function sourceScenes(input = {}) {
  const plan = object(input.creative_plan);
  return list(input.scenes).length ? list(input.scenes) : list(plan.scenes);
}

function flattenedShots(input = {}, scenes = []) {
  if (list(input.shots).length) return list(input.shots);
  return scenes.flatMap((scene) => list(scene.shots).map((shot) => ({
    ...shot,
    scene_id: shot.scene_id || scene.id,
  })));
}

function explicitParents(scene = {}) {
  const escalation = object(scene.escalation);
  return [...new Set([
    ...list(escalation.causal_parent_scene_ids),
    ...list(scene.causal_parent_scene_ids),
  ].map(text).filter(Boolean))];
}

function explicitPayoffs(scene = {}) {
  const escalation = object(scene.escalation);
  return [...new Set([
    ...list(escalation.payoff_of_scene_ids),
    ...list(scene.payoff_of_scene_ids),
  ].map(text).filter(Boolean))];
}

function authoredTension(value = {}, codePrefix = "STORY_ESCALATION_TENSION") {
  const tension = object(value.tension);
  const before = finite(tension.pressure_before);
  const after = finite(tension.pressure_after);
  const visualDensity = finite(tension.visual_density);
  const sonicPressure = finite(tension.sonic_pressure);
  for (const [name, score] of [["pressure_before", before], ["pressure_after", after], ["visual_density", visualDensity], ["sonic_pressure", sonicPressure]]) {
    if (score === null || score < 0 || score > 100) throw new Error(`${codePrefix}_${name.toUpperCase()}_REQUIRED`);
  }
  const revealState = requireText(tension.reveal_state, `${codePrefix}_REVEAL_STATE_REQUIRED`).toUpperCase();
  if (!["WITHHELD", "FRAGMENT", "ESCALATING", "REVEALED", "PAYOFF", "RELEASE"].includes(revealState)) {
    throw new Error(`${codePrefix}_REVEAL_STATE_INVALID`);
  }
  return {
    pressure_before: before,
    pressure_after: after,
    pressure_delta: Number((after - before).toFixed(3)),
    audience_question: requireText(tension.audience_question, `${codePrefix}_AUDIENCE_QUESTION_REQUIRED`),
    withheld_information: requireText(tension.withheld_information, `${codePrefix}_WITHHELD_INFORMATION_REQUIRED`),
    reveal_state: revealState,
    visual_density: visualDensity,
    sonic_pressure: sonicPressure,
    release_reason: text(tension.release_reason) || null,
    payoff: text(tension.payoff || tension.micro_payoff) || null,
    next_pressure_hook: text(tension.next_pressure_hook) || null,
  };
}

function pressureEvidence(scene = {}) {
  const escalation = object(scene.escalation);
  const before = finite(
    escalation.pressure_before ??
    escalation.story_pressure_before ??
    scene.story_pressure_before,
  );
  const after = finite(
    escalation.pressure_after ??
    escalation.story_pressure_after ??
    scene.story_pressure_after,
  );
  if (before === null || after === null) {
    return {
      measured: false,
      before: null,
      after: null,
      delta: null,
      direction: "UNSCORED",
      reason: "No explicit pressure measurement was authored; Avantiqo does not invent a numeric tension curve from prose.",
    };
  }
  const delta = Number((after - before).toFixed(3));
  return {
    measured: true,
    before,
    after,
    delta,
    direction: delta > 0 ? "RISE" : delta < 0 ? "RELEASE" : "HOLD",
    reason: "Direction is derived only from explicit authored pressure evidence.",
  };
}

function sceneContract({ scene, index, scenes, story }) {
  const id = requireText(scene.id, "STORY_ESCALATION_SCENE_ID_REQUIRED");
  const objective = requireText(scene.objective, `STORY_ESCALATION_OBJECTIVE_REQUIRED:${id}`);
  const before = requireText(scene.story_state_before, `STORY_ESCALATION_STATE_BEFORE_REQUIRED:${id}`);
  const change = requireText(scene.state_change, `STORY_ESCALATION_STATE_CHANGE_REQUIRED:${id}`);
  const after = requireText(scene.story_state_after, `STORY_ESCALATION_STATE_AFTER_REQUIRED:${id}`);
  const transition = requireText(scene.transition_logic, `STORY_ESCALATION_TRANSITION_REQUIRED:${id}`);
  if (normalize(before) === normalize(after)) {
    throw new Error(`STORY_ESCALATION_STAGNANT_SCENE:${id}`);
  }
  const duration = finite(scene.duration_seconds);
  if (!duration || duration <= 0) throw new Error(`STORY_ESCALATION_DURATION_REQUIRED:${id}`);

  const ids = new Set(scenes.map((entry) => text(entry.id)));
  const explicit = explicitParents(scene);
  const payoffOf = explicitPayoffs(scene);
  for (const parentId of [...explicit, ...payoffOf]) {
    if (!ids.has(parentId) || parentId === id) {
      throw new Error(`STORY_ESCALATION_INVALID_CAUSAL_REFERENCE:${id}:${parentId}`);
    }
  }

  const editPredecessor = index > 0 ? text(scenes[index - 1]?.id) : null;
  const causalParents = explicit.length
    ? explicit
    : editPredecessor ? [editPredecessor] : [];
  const role = index === 0
    ? "HOOK"
    : index === scenes.length - 1
      ? "RESOLUTION"
      : "ESCALATION";

  const contract = {
    contract: SCENE_CONTRACT,
    scene_id: id,
    scene_index: index,
    story_role: role,
    objective,
    emotion: requireText(scene.emotion, `STORY_ESCALATION_EMOTION_REQUIRED:${id}`),
    state_before: before,
    state_change: change,
    state_after: after,
    transition_logic: transition,
    edit_predecessor_scene_id: editPredecessor,
    causal_parent_scene_ids: causalParents,
    payoff_of_scene_ids: payoffOf,
    pressure: pressureEvidence(scene),
    authored_tension: authoredTension(scene, `STORY_ESCALATION_SCENE_TENSION:${id}`),
    master_escalation_intent: text(story.escalation) || null,
    master_hook: index === 0 ? text(story.hook) || null : null,
    master_resolution: index === scenes.length - 1 ? text(story.resolution) || null : null,
    duration_seconds: duration,
    causal_change_required: true,
    monotonic_tension_curve_not_required: true,
    tension_release_allowed_when_it_buys_later_impact: true,
    filler_scene_forbidden: true,
    provider_calls_executed: 0,
  };
  return {
    ...contract,
    contract_hash: digest(contract),
  };
}

function shotContracts(scene, shots = []) {
  const values = shots.filter((shot) => text(shot.scene_id) === text(scene.scene_id));
  if (!values.length) throw new Error(`STORY_ESCALATION_SHOTS_REQUIRED:${scene.scene_id}`);
  const purposes = values.map((shot) => normalize(shot.purpose)).filter(Boolean);
  if (purposes.length !== values.length || new Set(purposes).size !== purposes.length) {
    throw new Error(`STORY_ESCALATION_UNIQUE_SHOT_PURPOSE_REQUIRED:${scene.scene_id}`);
  }
  return values.map((shot, index) => {
    const shotId = requireText(shot.id, `STORY_ESCALATION_SHOT_ID_REQUIRED:${scene.scene_id}`);
    const purpose = requireText(shot.purpose, `STORY_ESCALATION_SHOT_PURPOSE_REQUIRED:${shotId}`);
    const role = index === 0
      ? "ENTER_SCENE_STATE"
      : index === values.length - 1
        ? "LAND_SCENE_CHANGE"
        : "ADVANCE_SCENE_CHANGE";
    const contract = {
      contract: SHOT_CONTRACT,
      shot_id: shotId,
      scene_id: scene.scene_id,
      story_progression_role: role,
      purpose,
      scene_objective: scene.objective,
      scene_state_change: scene.state_change,
      scene_state_after: scene.state_after,
      scene_escalation_contract_hash: scene.contract_hash,
      must_add_new_story_information: true,
      may_not_repeat_another_shot_purpose: true,
      beauty_without_story_progression_is_not_selection_authority: true,
      authored_tension: authoredTension(shot, `STORY_ESCALATION_SHOT_TENSION:${shotId}`),
      tension_function_required: true,
      provider_calls_executed: 0,
    };
    return {
      ...contract,
      contract_hash: digest(contract),
    };
  });
}

function enrichNestedScenes(scenes, sceneById, shotById) {
  return scenes.map((scene) => ({
    ...scene,
    story_escalation: sceneById.get(text(scene.id)),
    shots: list(scene.shots).map((shot) => ({
      ...shot,
      story_escalation: shotById.get(text(shot.id)),
    })),
  }));
}

export const CreativeStoryEscalationRuntime = Object.freeze({
  contract: CONTRACT,
  scene_contract: SCENE_CONTRACT,
  shot_contract: SHOT_CONTRACT,
  fixed_act_template_required: false,
  monotonic_tension_curve_required: false,
  provider_calls_executed: 0,

  build(input = {}) {
    const plan = object(input.creative_plan);
    if (text(plan.workflow_kind).toUpperCase() !== "TEMPORAL") {
      return { ...input, story_escalation: { contract: CONTRACT, applicable: false } };
    }
    const story = object(plan.story);
    requireText(story.hook, "STORY_ESCALATION_MASTER_HOOK_REQUIRED");
    requireText(story.escalation, "STORY_ESCALATION_MASTER_ESCALATION_REQUIRED");
    requireText(story.turn, "STORY_ESCALATION_MASTER_TURN_REQUIRED");
    requireText(story.resolution, "STORY_ESCALATION_MASTER_RESOLUTION_REQUIRED");

    const scenes = sourceScenes(input);
    if (!scenes.length) throw new Error("STORY_ESCALATION_SCENES_REQUIRED");
    const objectives = scenes.map((scene) => normalize(scene.objective));
    const changes = scenes.map((scene) => normalize(scene.state_change));
    if (objectives.some((value) => !value) || new Set(objectives).size !== objectives.length) {
      throw new Error("STORY_ESCALATION_UNIQUE_SCENE_OBJECTIVES_REQUIRED");
    }
    if (changes.some((value) => !value) || new Set(changes).size !== changes.length) {
      throw new Error("STORY_ESCALATION_UNIQUE_SCENE_CHANGES_REQUIRED");
    }

    const shots = flattenedShots(input, scenes);
    const sceneContracts = scenes.map((scene, index) => sceneContract({
      scene,
      index,
      scenes,
      story,
    }));
    const shotContractsAll = sceneContracts.flatMap((scene) => shotContracts(scene, shots));
    const sceneById = new Map(sceneContracts.map((entry) => [entry.scene_id, entry]));
    const shotById = new Map(shotContractsAll.map((entry) => [entry.shot_id, entry]));
    const enrichedScenes = enrichNestedScenes(scenes, sceneById, shotById);
    const enrichedShots = shots.map((shot) => ({
      ...shot,
      story_escalation: shotById.get(text(shot.id)),
    }));
    const graph = {
      contract: CONTRACT,
      story_contract_hash: digest(story),
      scene_contract_hashes: sceneContracts.map((entry) => entry.contract_hash),
      shot_contract_hashes: shotContractsAll.map((entry) => entry.contract_hash),
      scene_count: sceneContracts.length,
      shot_count: shotContractsAll.length,
      fixed_act_template_required: false,
      monotonic_tension_curve_required: false,
      causal_state_change_required_for_every_scene: true,
      unique_story_information_required_for_every_shot: true,
      authored_tension_required_for_every_scene_and_shot: true,
      constant_intensity_forbidden: true,
      releases_must_buy_later_impact: true,
      provider_neutral: true,
      provider_calls_executed: 0,
    };
    const graphHash = digest(graph);

    return {
      ...input,
      scenes: enrichedScenes,
      shots: enrichedShots,
      creative_plan: {
        ...plan,
        scenes: enrichedScenes,
        story_escalation: {
          ...graph,
          graph_hash: graphHash,
          scene_contracts: sceneContracts,
          shot_contracts: shotContractsAll,
        },
      },
      story_escalation: {
        ...graph,
        graph_hash: graphHash,
        applicable: true,
      },
    };
  },

  verifyShot(value = {}) {
    const contract = object(value);
    if (contract.contract !== SHOT_CONTRACT) throw new Error("STORY_ESCALATION_SHOT_CONTRACT_REQUIRED");
    if (text(contract.contract_hash) !== digest(contract)) throw new Error("STORY_ESCALATION_SHOT_HASH_MISMATCH");
    return contract;
  },

  hash: digest,
});

export const AVANTIQO_STORY_ESCALATION_CONTRACT = CONTRACT;
