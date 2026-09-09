import { normalizeTemporalMechanicalContract } from "@/lib/creative/director/runtime/CreativeTemporalMechanicalNormalizationRuntime";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function unique(values = []) { return [...new Set(values.map(text).filter(Boolean))]; }
function normalized(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

function allShots(plan = {}) {
  return list(plan.scenes).flatMap((scene, sceneIndex) =>
    list(scene.shots).map((shot, shotIndex) => ({ scene, shot, sceneIndex, shotIndex })),
  );
}

function spatialAuthority(plan = {}) {
  const scenes = list(plan.scenes);
  const primaryRefs = unique(scenes.map((scene) => scene.location?.reference_asset_id));
  if (primaryRefs.length === 1) {
    return { mode: "PRIMARY_REFERENCE", value: primaryRefs[0] };
  }
  if (primaryRefs.length > 1) return null;
  const supportingSets = scenes.map((scene) => new Set(list(scene.reference_asset_ids).map(text).filter(Boolean)));
  const commonSupporting = supportingSets.length
    ? [...supportingSets[0]].filter((ref) => supportingSets.every((set) => set.has(ref)))
    : [];
  if (commonSupporting.length === 1) {
    return { mode: "COMMON_REFERENCE", value: commonSupporting[0] };
  }
  const locations = unique(scenes.map((scene) => normalized(scene.location?.name)));
  if (locations.length === 1 && locations[0]) return { mode: "LOCATION", value: locations[0] };
  return null;
}

function movingShot(entries = []) {
  return entries.find(({ shot }) => {
    const move = normalized(shot.camera?.movement_path || shot.camera?.movement || "");
    return move && !/\b(no camera movement|no movement|static|stationary|locked off|locked)\b/.test(move);
  }) || entries[0] || null;
}

function widestLensEntry(entries = []) {
  const parsed = entries.map((entry) => {
    const match = text(entry.shot?.camera?.lens_intent).match(/(\d+(?:\.\d+)?)\s*mm/i);
    return { entry, focal: match ? Number(match[1]) : null };
  }).filter((item) => Number.isFinite(item.focal));
  parsed.sort((a, b) => a.focal - b.focal);
  return parsed[0]?.entry || null;
}


function focalLength(entry = null) {
  const match = text(entry?.shot?.camera?.lens_intent).match(/(\d+(?:\.\d+)?)\s*mm/i);
  return match ? Number(match[1]) : null;
}

function closingEntryForLens(entries = [], lensEntry = null) {
  const target = focalLength(lensEntry);
  const lastSceneIndex = Math.max(...entries.map((entry) => entry.sceneIndex), 0);
  const endings = entries.filter((entry) => entry.sceneIndex === lastSceneIndex);
  if (!Number.isFinite(target)) return endings.at(-1) || entries.at(-1) || null;
  const compatible = endings.map((entry) => ({ entry, focal: focalLength(entry) }))
    .filter((item) => Number.isFinite(item.focal))
    .sort((a, b) => Math.abs(a.focal - target) - Math.abs(b.focal - target));
  return compatible[0]?.entry || endings.at(-1) || entries.at(-1) || null;
}

function critiqueScalarRepairs(critique = {}) {
  const changes = list(critique.required_repairs).map((repair) => text(repair.required_change));
  let panSpeed = null;
  let openingScalePercent = null;
  for (const change of changes) {
    const pan = change.match(/pan speed[^\d]*(\d+(?:\.\d+)?)\s*°?\s*\/?\s*sec/i) ||
      change.match(/(\d+(?:\.\d+)?)\s*°\s*\/\s*sec/i);
    if (pan) panSpeed = Number(pan[1]);
    const opening = change.match(/(?:frame size|opening)[^\d]*(\d+(?:\.\d+)?)\s*%/i);
    if (opening) openingScalePercent = Number(opening[1]);
  }
  return { panSpeed, openingScalePercent, changes };
}


function replaceAngularSpeed(value, speed) {
  const source = text(value);
  if (!Number.isFinite(speed)) return source;
  const replacement = `${speed}°/sec`;
  const replaced = source.replace(/\d+(?:\.\d+)?\s*°?\s*\/?\s*sec/gi, replacement);
  return replaced !== source ? replaced : `${source} at ${replacement}`.trim();
}

function openingKineticRepair(critique = {}, firstSceneId = "") {
  return list(critique.required_repairs).some((repair) =>
    (!text(repair.id) || normalized(repair.id) === normalized(firstSceneId)) &&
    /kinetic|stationary|motion|frame size|opening/i.test(`${text(repair.problem)} ${text(repair.required_change)}`),
  );
}

function mergedAudio(entries = []) {
  return {
    source_sound: unique(entries.map(({ shot }) => shot.audio?.source_sound)).join(" → "),
    mix_intent: unique(entries.map(({ shot }) => shot.audio?.mix_intent)).join(" "),
  };
}

function mergedContinuity(entries = [], authority = null) {
  const first = entries[0]?.shot || {};
  const last = entries.at(-1)?.shot || {};
  return {
    identity: text(first.continuity?.identity) || text(last.continuity?.identity),
    product: text(first.continuity?.product) || text(last.continuity?.product),
    location: text(last.continuity?.location) || text(first.continuity?.location),
    wardrobe: text(first.continuity?.wardrobe) || text(last.continuity?.wardrobe),
    screen_direction: unique(entries.map(({ shot }) => shot.continuity?.screen_direction)).join(" → "),
    spatial_geography: [
      authority ? `Single spatial authority: ${authority.value}.` : "",
      ...unique(entries.map(({ shot }) => shot.continuity?.spatial_geography)),
      "The recovered shot preserves one physical axis and forbids editorial teleportation.",
    ].filter(Boolean).join(" "),
  };
}

function oneShotScene(plan = {}, entries = [], authority = null, critique = {}) {
  const scenes = list(plan.scenes);
  const firstScene = scenes[0] || {};
  const lastScene = scenes.at(-1) || firstScene;
  const firstShot = entries[0]?.shot || {};
  const motionEntry = movingShot(entries);
  const lensEntry = widestLensEntry(entries) || motionEntry;
  const closingEntry = closingEntryForLens(entries, lensEntry);
  const lastShot = closingEntry?.shot || entries.at(-1)?.shot || firstShot;
  const motionShot = motionEntry?.shot || firstShot;
  const lensShot = lensEntry?.shot || motionShot;
  const repairs = critiqueScalarRepairs(critique);

  const panSpeed = repairs.panSpeed;
  const movementPath = panSpeed
    ? replaceAngularSpeed(motionShot.camera?.movement_path || motionShot.camera?.movement, panSpeed)
    : text(motionShot.camera?.movement_path || motionShot.camera?.movement);
  const movementSpeed = panSpeed ? `${panSpeed}°/sec` : text(motionShot.camera?.movement_speed);
  const removeStaticOpening = openingKineticRepair(critique, firstScene.id);
  const actionEntries = removeStaticOpening
    ? entries.filter((entry) => !(entry.sceneIndex === 0 && /\b(stationary|no movement|static)\b/.test(normalized(entry.shot?.action))))
    : entries;
  const actions = unique(actionEntries.map(({ shot }) => shot.action));
  const progression = actions.length
    ? `In one uninterrupted physical event: ${actions.join(" → ")}.`
    : text(firstShot.frame_plan?.progression);
  const negativeConstraints = unique(entries.flatMap(({ shot }) => list(shot.negative_constraints)));
  const failureModes = unique(entries.flatMap(({ shot }) => list(shot.known_failure_modes)));
  const repairInstructions = unique([
    ...entries.flatMap(({ shot }) => list(shot.repair_instructions)),
    ...repairs.changes,
    "Preserve one continuous camera, one physical axis and one coherent location authority.",
  ]);
  const referenceAssetIds = unique(scenes.flatMap((scene) => [
    scene.location?.reference_asset_id,
    ...list(scene.reference_asset_ids),
  ]));

  const shot = {
    ...motionShot,
    id: text(firstShot.id) || "single_continuous_shot_001",
    duration_seconds: finite(plan.temporal_contract?.duration_seconds) ||
      scenes.reduce((sum, scene) => sum + (finite(scene.duration_seconds) || 0), 0),
    subject: text(motionShot.subject) || text(firstShot.subject) || text(lastShot.subject),
    purpose: unique(entries.map(({ shot }) => shot.purpose)).join(" → "),
    action: actions.join(" → "),
    frame_plan: {
      ...object(motionShot.frame_plan),
      opening_frame: repairs.openingScalePercent
        ? (text(motionShot.frame_plan?.opening_frame) || text(firstShot.frame_plan?.closing_frame) || text(firstShot.subject))
        : (text(firstShot.frame_plan?.opening_frame) || text(firstShot.subject)),
      progression,
      closing_frame: text(lastShot.frame_plan?.closing_frame) || text(lastShot.subject),
    },
    camera: {
      ...object(motionShot.camera),
      lens_intent: text(lensShot.camera?.lens_intent) || text(motionShot.camera?.lens_intent),
      movement_path: movementPath,
      movement_speed: movementSpeed,
      movement_motivation: text(motionShot.camera?.movement_motivation) ||
        "The camera follows the authored subject trajectory so the reveal is caused by physical action rather than a cut.",
    },
    audio: mergedAudio(entries),
    continuity: mergedContinuity(entries, authority),
    negative_constraints: negativeConstraints,
    known_failure_modes: failureModes,
    repair_instructions: repairInstructions,
    visual_repairs: {
      opening_subject_scale_adjustment_percent: repairs.openingScalePercent || null,
      opening_subject_scale_multiplier: repairs.openingScalePercent
        ? Number((1 + repairs.openingScalePercent / 100).toFixed(3))
        : null,
      pan_speed_degrees_per_second: panSpeed || null,
    },
  };

  return {
    ...firstScene,
    id: text(firstScene.id) || "scene_001",
    title: unique([firstScene.title, lastScene.title]).join(" → ") || "Single Continuous Shot",
    objective: unique(scenes.map((scene) => scene.objective)).join(" → "),
    emotion: unique(scenes.map((scene) => scene.emotion)).join(" → "),
    story_state_before: text(firstScene.story_state_before),
    state_change: unique(scenes.map((scene) => scene.state_change)).join(" → "),
    story_state_after: text(lastScene.story_state_after),
    transition_logic: "All authored story states now resolve inside one continuous shot; no editorial cut is permitted.",
    duration_seconds: shot.duration_seconds,
    location: object(motionEntry?.scene?.location || lastScene.location || firstScene.location),
    reference_asset_ids: referenceAssetIds,
    tension: {
      ...object(firstScene.tension),
      pressure_after: finite(lastScene.tension?.pressure_after) ?? finite(firstScene.tension?.pressure_after),
      payoff: text(lastScene.tension?.payoff) || text(lastScene.story_state_after),
    },
    camera_style: {
      ...object(motionEntry?.scene?.camera_style || firstScene.camera_style),
      movement: movementPath,
      focus: text(motionShot.camera?.focus_target || motionEntry?.scene?.camera_style?.focus),
    },
    shots: [shot],
  };
}


function enforceMusicPolicy(plan = {}) {
  if (plan.temporal_contract?.music_allowed !== false) return plan;
  return {
    ...plan,
    deliverables: list(plan.deliverables).map((deliverable, index) => index === 0
      ? { ...deliverable, output_spec: { ...object(deliverable.output_spec), audio: "Authentic physical source sound only; music disabled." } }
      : deliverable),
    scenes: list(plan.scenes).map((scene) => ({
      ...scene,
      audio_style: { ...object(scene.audio_style), music: "None", sound_design: text(scene.audio_style?.sound_design) || "Authentic physical source sound follows the visible action." },
    })),
  };
}

export function recoverSingleContinuousShot({ plan = {}, critique = {} } = {}) {
  if (plan.temporal_contract?.single_continuous_shot !== true) {
    throw new Error("CREATIVE_SINGLE_SHOT_RECOVERY_CONTRACT_REQUIRED");
  }
  const entries = allShots(plan);
  if (entries.length < 2 && list(plan.scenes).length <= 1) {
    return { contract: "CREATIVE_SINGLE_SHOT_RECOVERY_V1", recovered: false, plan };
  }
  const authority = spatialAuthority(plan);
  if (!authority) {
    throw new Error("CREATIVE_SINGLE_SHOT_RECOVERY_SPATIAL_AUTHORITY_REQUIRED");
  }
  const duration = finite(plan.temporal_contract?.duration_seconds) ||
    list(plan.scenes).reduce((sum, scene) => sum + (finite(scene.duration_seconds) || 0), 0);
  if (!duration || duration <= 0) throw new Error("CREATIVE_SINGLE_SHOT_RECOVERY_DURATION_REQUIRED");

  let recovered = {
    ...plan,
    temporal_contract: {
      ...object(plan.temporal_contract),
      duration_seconds: duration,
      single_continuous_shot: true,
      scene_count: 1,
      shot_count: 1,
    },
    scenes: [oneShotScene(plan, entries, authority, critique)],
  };
  recovered = enforceMusicPolicy(recovered);
  recovered = normalizeTemporalMechanicalContract(recovered, { duration_seconds: duration });

  if (process.env.AVANTIQO_SINGLE_SHOT_RECOVERY_DIAGNOSTIC === "1") {
    console.log("SINGLE_SHOT_RECOVERY_DIAGNOSTIC=" + JSON.stringify({
      scene_count: list(recovered.scenes).length,
      shot_count: list(recovered.scenes).flatMap((scene) => list(scene.shots)).length,
      actions: list(recovered.scenes).flatMap((scene) => list(scene.shots).map((shot) => shot.action)),
      purposes: list(recovered.scenes).flatMap((scene) => list(scene.shots).map((shot) => shot.purpose)),
    }));
  }
  return {
    contract: "CREATIVE_SINGLE_SHOT_RECOVERY_V1",
    recovered: true,
    spatial_authority: authority,
    critique_repairs_applied: critiqueScalarRepairs(critique).changes,
    plan: recovered,
  };
}

export const CreativeSingleShotRecoveryRuntime = Object.freeze({
  contract: "CREATIVE_SINGLE_SHOT_RECOVERY_V1",
  recover: recoverSingleContinuousShot,
});
