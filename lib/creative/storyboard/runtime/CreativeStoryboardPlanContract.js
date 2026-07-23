const ROUNDING = 10;
const MAX_SHOT_DURATION_SECONDS = 15;

function round(value) {
  return Math.round(Number(value || 0) * ROUNDING) / ROUNDING;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function hasObjectValues(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length,
  );
}

function meaningful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return hasText(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function firstMeaningful(...values) {
  return values.find(meaningful);
}

function firstObject(...values) {
  return values.map(object).find(hasObjectValues) || {};
}

function firstList(...values) {
  return values.map(list).find((value) => value.length) || [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function mergedObjects(...values) {
  return values.reduce(
    (output, value) => ({
      ...output,
      ...object(value),
    }),
    {},
  );
}

function requiredStoryBeats(brief = {}) {
  const specifications = brief.specifications || {};
  const candidates = [
    brief.required_story_beats,
    brief.scene_plan,
    brief.structure,
    specifications.required_story_beats,
    specifications.scene_plan,
    specifications.structure,
  ];

  return candidates
    .find((value) => Array.isArray(value))
    ?.map((value) => String(value || "").trim())
    .filter(Boolean) || [];
}

function significantTerms(value = "") {
  const stop = new Set([
    "the", "and", "with", "from", "into", "for", "this", "that",
    "scene", "shot", "seconds", "second", "film", "video", "master",
    "cinematic", "campaign",
  ]);

  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !stop.has(term));
}

function planText(plan = {}) {
  return JSON.stringify(plan).toLowerCase();
}

function visualAssets(assets = []) {
  return assets.filter((asset) => {
    if (!asset?.id) return false;
    const description = [
      asset.asset_type,
      asset.mime_type,
      asset.metadata?.mime_type,
      asset.file_name,
      asset.file_url,
      asset.image_url,
      asset.url,
    ].filter(Boolean).join(" ").toLowerCase();

    if (
      /audio\//.test(description) ||
      /\.(mp3|wav|aac|m4a|flac)(?:\?|$)/.test(description)
    ) {
      return false;
    }

    return true;
  });
}

function temporalDepartment(shot = {}, key) {
  return object(object(shot.temporal_contract)[key]);
}

function temporalTrackRules(shot = {}, departments = []) {
  return departments.flatMap((department) =>
    list(temporalDepartment(shot, department).tracks)
      .flatMap((track) => list(track?.physical_rules)),
  );
}

function temporalFailureConditions(shot = {}) {
  return [
    "camera",
    "performance",
    "objects_products",
    "lighting",
    "environment",
    "focus_exposure",
    "sound",
    "editorial",
  ].flatMap((department) =>
    list(temporalDepartment(shot, department).failure_conditions),
  );
}

function canonicalReferenceIds(shot = {}) {
  return unique([
    ...list(shot.reference_asset_ids),
    ...list(shot.assets),
    ...list(shot.master_still_contract?.reference_asset_ids),
  ]);
}

function canonicalCamera(shot = {}) {
  return mergedObjects(
    shot.master_still_contract?.exact_camera_state,
    shot.camera_contract,
    shot.cinematography,
    shot.camera,
  );
}

function canonicalLighting(shot = {}) {
  return mergedObjects(
    shot.master_still_contract?.exact_lighting_state,
    shot.lighting_contract,
    shot.production_design?.lighting,
    shot.lighting,
  );
}

function canonicalContinuity(shot = {}) {
  const temporal = object(shot.temporal_contract?.continuity);
  const contract = object(shot.continuity_contract);
  const direct = object(shot.continuity);
  const combined = {
    ...temporal,
    ...contract,
    ...direct,
  };

  return {
    ...combined,
    entering: firstMeaningful(
      direct.entering,
      direct.entering_state,
      contract.entering,
      contract.entering_state,
      temporal.entering,
      temporal.entering_state,
    ) || "",
    leaving: firstMeaningful(
      direct.leaving,
      direct.leaving_state,
      contract.leaving,
      contract.leaving_state,
      temporal.leaving,
      temporal.leaving_state,
    ) || "",
    locks: firstList(
      direct.locks,
      contract.locks,
      temporal.locks,
      shot.temporal_contract?.immutable_locks,
    ),
    handoff_requirements: firstList(
      direct.handoff_requirements,
      contract.handoff_requirements,
      temporal.handoff_requirements,
    ),
  };
}

function canonicalReferencePack(shot = {}) {
  const direct = object(shot.reference_pack);
  const contract = firstObject(
    shot.reference_contract,
    shot.reference_rules,
  );
  const master = object(shot.master_still_contract);

  return {
    ...contract,
    ...direct,
    preserve: firstList(
      direct.preserve,
      contract.preserve,
      master.immutable_locks,
    ),
    never_change: firstList(
      direct.never_change,
      contract.never_change,
      master.prohibited_changes,
    ),
    may_change: firstList(
      direct.may_change,
      contract.may_change,
      master.permitted_motion,
    ),
    may_change_reason: firstMeaningful(
      direct.may_change_reason,
      contract.may_change_reason,
      master.safe_motion_space,
    ) || null,
  };
}

function canonicalRealityRules(shot = {}) {
  const direct = firstObject(
    shot.reality_rules,
    shot.physical_reality_rules,
  );

  return {
    ...direct,
    human: firstList(
      direct.human,
      temporalTrackRules(shot, ["performance"]),
    ),
    physical: firstList(
      direct.physical,
      temporalTrackRules(shot, [
        "camera",
        "objects_products",
        "focus_exposure",
      ]),
    ),
    environment: firstList(
      direct.environment,
      temporalTrackRules(shot, [
        "lighting",
        "environment",
      ]),
    ),
  };
}

function canonicalEditorial(shot = {}) {
  return mergedObjects(
    shot.temporal_contract?.editorial,
    shot.edit_contract,
    shot.editorial_contract,
    shot.editing,
  );
}

function canonicalSound(shot = {}) {
  return mergedObjects(
    shot.temporal_contract?.sound,
    shot.audio,
    shot.sound_contract,
    shot.sound,
  );
}

function canonicalPerformance(shot = {}) {
  return mergedObjects(
    shot.temporal_contract?.performance,
    shot.blocking,
    shot.performance_contract,
  );
}

function canonicalQualityRequirements(shot = {}) {
  const direct = object(shot.quality_requirements);
  const temporal = object(shot.temporal_contract?.quality_requirements);
  const approvals = list(
    shot.master_still_contract?.approval_requirements,
  );

  if (hasObjectValues(direct)) return direct;
  if (hasObjectValues(temporal)) return temporal;
  if (approvals.length) {
    return {
      master_still_approval_requirements: approvals,
    };
  }
  return {};
}

function canonicalNegativeConstraints(shot = {}) {
  return firstList(
    shot.negative_constraints,
    shot.failure_prevention,
    shot.master_still_contract?.prohibited_changes,
    temporalFailureConditions(shot),
  );
}

function cameraValue(camera = {}, aliases = []) {
  return firstMeaningful(
    ...aliases.map((key) => camera[key]),
  );
}

function cameraFailures(camera = {}, label) {
  const failures = [];
  const requirements = {
    framing: ["framing", "shot_size", "frame_size"],
    movement: ["movement", "movement_type", "camera_movement", "motion"],
    lens: ["lens", "lens_behavior", "focal_length", "lens_choice"],
    angle: ["angle", "camera_angle"],
    camera_height: ["camera_height", "height"],
    start_position: ["start_position", "camera_start_position", "start"],
    end_position: ["end_position", "camera_end_position", "end"],
    support: ["support", "stabilization", "rig"],
    movement_speed: ["movement_speed", "speed", "pace"],
    focus_strategy: ["focus_strategy", "focus", "focus_plan"],
    composition: ["composition", "frame_composition"],
    motivation: ["motivation", "reason", "rationale", "intent"],
  };

  if (!hasObjectValues(camera)) {
    failures.push(`${label}: camera contract missing`);
    return failures;
  }

  const missing = Object.entries(requirements)
    .filter(([, aliases]) => !cameraValue(camera, aliases))
    .map(([key]) => key);

  if (missing.length) {
    failures.push(`${label}: camera detail missing ${missing.join(", ")}`);
  }

  return failures;
}

function lightingValue(lighting = {}, aliases = []) {
  return firstMeaningful(
    ...aliases.map((key) => lighting[key]),
  );
}

function lightingFailures(lighting = {}, label) {
  const failures = [];
  const requirements = {
    motivation: ["motivation", "reason", "rationale", "intent"],
    source_positions: ["source_positions", "sources", "light_positions"],
    key_fill_edge: ["key_fill_edge", "key_fill_rim", "lighting_ratio"],
    color_temperature: ["color_temperature", "temperature", "white_balance"],
    exposure_hierarchy: ["exposure_hierarchy", "exposure_priority"],
    contrast: ["contrast", "contrast_ratio"],
    continuity: ["continuity", "continuity_rules", "lighting_continuity"],
  };

  if (!hasObjectValues(lighting)) {
    failures.push(`${label}: lighting contract missing`);
    return failures;
  }

  const missing = Object.entries(requirements)
    .filter(([, aliases]) => !lightingValue(lighting, aliases))
    .map(([key]) => key);

  if (missing.length) {
    failures.push(`${label}: lighting detail missing ${missing.join(", ")}`);
  }

  return failures;
}

function referenceFailures(shot = {}, label, assetsAvailable) {
  const failures = [];
  const pack = canonicalReferencePack(shot);
  const continuity = canonicalContinuity(shot);
  const references = canonicalReferenceIds(shot);

  if (!hasObjectValues(pack)) {
    failures.push(`${label}: reference pack missing`);
  }
  if (!list(pack.preserve).length) {
    failures.push(`${label}: reference preserve rules missing`);
  }
  if (!list(pack.never_change).length) {
    failures.push(`${label}: reference never-change rules missing`);
  }
  if (!list(pack.may_change).length && !pack.may_change_reason) {
    failures.push(`${label}: reference may-change boundaries missing`);
  }
  if (!hasObjectValues(continuity)) {
    failures.push(`${label}: continuity contract missing`);
  }
  if (!list(continuity.locks).length) {
    failures.push(`${label}: continuity locks missing`);
  }
  if (!hasText(continuity.entering)) {
    failures.push(`${label}: continuity entering state missing`);
  }
  if (!hasText(continuity.leaving)) {
    failures.push(`${label}: continuity leaving state missing`);
  }
  if (assetsAvailable && !references.length) {
    failures.push(`${label}: no canonical reference asset selected`);
  }

  return failures;
}

function physicalRealityFailures(shot = {}, label) {
  const failures = [];
  const rules = canonicalRealityRules(shot);

  if (!hasObjectValues(rules)) {
    failures.push(`${label}: physical reality rules missing`);
    return failures;
  }

  const categories = [
    "human",
    "physical",
    "environment",
  ];
  const missing = categories.filter((key) => !list(rules[key]).length);
  if (missing.length) {
    failures.push(`${label}: physical reality categories missing ${missing.join(", ")}`);
  }

  return failures;
}

function soundAndEditFailures(shot = {}, label) {
  const failures = [];
  const editorial = canonicalEditorial(shot);
  const sound = canonicalSound(shot);

  const transitionIn = firstObject(
    shot.transition_in,
    editorial.transition_in,
    editorial.entry_transition,
  );
  const transitionOut = firstObject(
    shot.transition_out,
    editorial.transition_out,
    editorial.exit_transition,
  );

  if (!hasObjectValues(transitionIn)) {
    failures.push(`${label}: transition-in direction missing`);
  }
  if (!hasObjectValues(transitionOut)) {
    failures.push(`${label}: transition-out direction missing`);
  }

  const explicitSound = Boolean(
    hasObjectValues(shot.music) ||
    list(shot.sound_effects).length ||
    list(shot.dialogue).length ||
    hasObjectValues(shot.narration),
  );
  const contractSound = Boolean(
    hasObjectValues(sound) && (
      list(sound.tracks).length ||
      list(sound.events).length ||
      list(sound.directed_evolution).length ||
      list(sound.immutable_locks).length ||
      hasText(sound.intent) ||
      hasText(sound.direction)
    ),
  );

  if (!explicitSound && !contractSound) {
    failures.push(`${label}: sound direction missing`);
  }

  const post = firstObject(
    shot.post_production,
    shot.post_production_contract,
    editorial.post_production,
    editorial,
  );

  if (!hasObjectValues(post)) {
    failures.push(`${label}: post-production ownership missing`);
  }

  return failures;
}

function actorBehavior(actor = {}) {
  const blocking = mergedObjects(
    actor.blocking,
    actor.performance,
  );

  return {
    starting_position: firstMeaningful(
      actor.starting_position,
      actor.start_position,
      blocking.starting_position,
      blocking.start_position,
    ),
    movement_path: firstMeaningful(
      actor.movement_path,
      actor.path,
      blocking.movement_path,
      blocking.path,
    ),
    eye_line: firstMeaningful(
      actor.eye_line,
      actor.eyeline,
      blocking.eye_line,
      blocking.eyeline,
    ),
    gesture: firstMeaningful(
      actor.gesture,
      actor.gestures,
      blocking.gesture,
      blocking.gestures,
    ),
    reaction_timing: firstMeaningful(
      actor.reaction_timing,
      actor.timing,
      blocking.reaction_timing,
      blocking.timing,
    ),
    object_contact: firstMeaningful(
      actor.object_contact,
      actor.contact,
      blocking.object_contact,
      blocking.contact,
    ),
  };
}

function performanceFailures(shot = {}, label) {
  const failures = [];
  const performance = canonicalPerformance(shot);
  const temporalEvidence = Boolean(
    list(performance.tracks).length ||
    list(performance.events).length ||
    list(performance.directed_evolution).length,
  );

  const direction = firstMeaningful(
    shot.performance_direction,
    shot.blocking_direction,
    performance.direction,
    performance.performance_direction,
    performance.summary,
    performance.intent,
  );

  if (!hasText(direction) && !temporalEvidence) {
    failures.push(`${label}: performance direction missing`);
  }

  const actionBeats = firstList(
    shot.action_beats,
    performance.action_beats,
    performance.beats,
    performance.events,
  );

  if (!actionBeats.length && !list(performance.tracks).length) {
    failures.push(`${label}: action beats missing`);
  }

  const actors = list(shot.actors);
  for (const [index, actor] of actors.entries()) {
    const actorLabel = `${label} actor ${index + 1}`;
    const behavior = actorBehavior(actor);
    if (Object.values(behavior).some((value) => !meaningful(value))) {
      failures.push(`${actorLabel}: blocking or behavior incomplete`);
    }
  }

  return failures;
}

function shotFailures(shot = {}, sceneNumber, shotNumber, assetsAvailable) {
  const failures = [];
  const label = `scene ${sceneNumber} shot ${shotNumber}`;
  const duration = Number(
    shot.duration_seconds ??
    shot.duration ??
    0,
  );

  if (!hasText(firstMeaningful(shot.title, shot.name))) {
    failures.push(`${label}: title missing`);
  }
  if (!hasText(firstMeaningful(shot.purpose, shot.objective))) {
    failures.push(`${label}: purpose missing`);
  }
  if (!hasText(firstMeaningful(
    shot.opening_frame,
    shot.opening_state,
    shot.frame_zero_description,
  ))) {
    failures.push(`${label}: opening frame missing`);
  }
  if (!hasText(firstMeaningful(
    shot.closing_frame,
    shot.closing_state,
    shot.end_frame,
  ))) {
    failures.push(`${label}: closing frame missing`);
  }
  if (duration <= 0 || duration > MAX_SHOT_DURATION_SECONDS) {
    failures.push(`${label}: duration outside 0-${MAX_SHOT_DURATION_SECONDS}s`);
  }

  failures.push(
    ...cameraFailures(canonicalCamera(shot), label),
    ...lightingFailures(canonicalLighting(shot), label),
    ...performanceFailures(shot, label),
    ...referenceFailures(shot, label, assetsAvailable),
    ...physicalRealityFailures(shot, label),
    ...soundAndEditFailures(shot, label),
  );

  if (!canonicalNegativeConstraints(shot).length) {
    failures.push(`${label}: shot-specific failure prevention missing`);
  }
  if (!hasObjectValues(canonicalQualityRequirements(shot))) {
    failures.push(`${label}: measurable quality requirements missing`);
  }

  return failures;
}

function normalizeShot(shot = {}, shotIndex = 0) {
  const output = clone(shot) || {};
  const references = canonicalReferenceIds(output);

  output.shot_number = shotIndex + 1;
  output.duration_seconds = Number(
    output.duration_seconds ??
    output.duration ??
    0,
  );
  output.reference_asset_ids = references;
  output.assets = references;

  if (!hasObjectValues(output.camera)) {
    output.camera = canonicalCamera(output);
  }
  if (!hasObjectValues(output.lighting)) {
    output.lighting = canonicalLighting(output);
  }
  if (!hasObjectValues(output.continuity)) {
    output.continuity = canonicalContinuity(output);
  } else {
    output.continuity = canonicalContinuity(output);
  }
  if (!hasObjectValues(output.reference_pack)) {
    output.reference_pack = canonicalReferencePack(output);
  }
  if (!hasObjectValues(output.reality_rules)) {
    output.reality_rules = canonicalRealityRules(output);
  }
  if (!list(output.negative_constraints).length) {
    output.negative_constraints = canonicalNegativeConstraints(output);
  }
  if (!hasObjectValues(output.quality_requirements)) {
    output.quality_requirements = canonicalQualityRequirements(output);
  }

  return output;
}

export function normalizeCreativeStoryboardPlan(plan = {}) {
  const output = clone(plan) || {};
  output.scenes = list(output.scenes).map((scene, sceneIndex) => ({
    ...scene,
    scene_number: sceneIndex + 1,
    duration_seconds: Number(
      scene.duration_seconds ??
      scene.duration ??
      0,
    ),
    shots: list(scene.shots).map(normalizeShot),
  }));
  return output;
}

function failureOwner(failure = "") {
  const value = String(failure).toLowerCase();

  if (value.includes("camera")) return "CINEMATOGRAPHY_CAMERA";
  if (value.includes("lighting")) return "LIGHTING_PRODUCTION_DESIGN";
  if (
    value.includes("performance") ||
    value.includes("action beats") ||
    value.includes("actor ") ||
    value.includes("blocking")
  ) {
    return "PERFORMANCE_CASTING_BLOCKING";
  }
  if (
    value.includes("reference") ||
    value.includes("continuity") ||
    value.includes("physical reality")
  ) {
    return "IDENTITY_REFERENCE_CONTINUITY_REALITY";
  }
  if (
    value.includes("sound") ||
    value.includes("transition") ||
    value.includes("post-production")
  ) {
    return "SOUND_EDITORIAL_POST";
  }
  if (
    value.includes("duration") ||
    value.includes("story beats") ||
    value.includes("title") ||
    value.includes("purpose") ||
    value.includes("objective") ||
    value.includes("emotion") ||
    value.includes("opening frame") ||
    value.includes("closing frame")
  ) {
    return "EXECUTIVE_NARRATIVE_EDITORIAL";
  }
  return "EXECUTIVE_QUALITY_SUPERVISION";
}

function failureCode(failure = "") {
  const value = String(failure)
    .replace(/^scene\s+\d+(?:\s+shot\s+\d+)?(?:\s+actor\s+\d+)?:\s*/i, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

  return value || "STORYBOARD_CONTRACT_FAILURE";
}

function failureFields(failure = "") {
  const value = String(failure);
  const detail = value.match(/detail missing\s+(.+)$/i);
  if (detail) {
    return detail[1]
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  const categories = value.match(/categories missing\s+(.+)$/i);
  if (categories) {
    return categories[1]
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  const beat = value.match(/required story beats missing:\s*(.+)$/i);
  if (beat) {
    return beat[1]
      .split("|")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  return [];
}

function failureDetail(failure, index) {
  const value = String(failure);
  const actor = value.match(
    /^scene\s+(\d+)\s+shot\s+(\d+)\s+actor\s+(\d+):/i,
  );
  const shot = value.match(
    /^scene\s+(\d+)\s+shot\s+(\d+):/i,
  );
  const scene = value.match(
    /^scene\s+(\d+):/i,
  );

  const sceneNumber = Number(
    actor?.[1] ||
    shot?.[1] ||
    scene?.[1] ||
    0,
  ) || null;
  const shotNumber = Number(
    actor?.[2] ||
    shot?.[2] ||
    0,
  ) || null;
  const actorNumber = Number(actor?.[3] || 0) || null;

  return {
    id: `storyboard_${index + 1}`,
    failure: value,
    code: failureCode(value),
    owner: failureOwner(value),
    scope: shotNumber
      ? "SHOT"
      : sceneNumber
        ? "SCENE"
        : "PLAN",
    scene_number: sceneNumber,
    shot_number: shotNumber,
    actor_number: actorNumber,
    fields: failureFields(value),
    severity: "BLOCKING",
  };
}

function failureGroups(details = []) {
  const groups = new Map();

  for (const detail of details) {
    const key = [
      detail.scope,
      detail.scene_number || 0,
      detail.shot_number || 0,
    ].join(":");

    const current = groups.get(key) || {
      key,
      scope: detail.scope,
      scene_number: detail.scene_number,
      shot_number: detail.shot_number,
      owners: [],
      failures: [],
      fields: [],
    };

    current.owners = unique([
      ...current.owners,
      detail.owner,
    ]);
    current.failures.push(detail.failure);
    current.fields = unique([
      ...current.fields,
      ...detail.fields,
    ]);
    groups.set(key, current);
  }

  return [...groups.values()];
}

export function inspectCreativeStoryboardPlan({
  creativePlan,
  targetDuration,
  brief = {},
  assets = [],
} = {}) {
  const target = Number(targetDuration || 30);
  const plan = normalizeCreativeStoryboardPlan(creativePlan);
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const failures = [];
  const warnings = [];
  const assetIds = new Set(
    visualAssets(assets).map((asset) => String(asset.id)),
  );
  const sceneTitles = new Set();
  const shotTitles = new Set();
  const referencedShots = [];
  const selectedAssetIds = new Set();

  if (!scenes.length) failures.push("production bible has no scenes");
  if (!shots.length) failures.push("production bible has no shots");

  for (const [sceneIndex, scene] of scenes.entries()) {
    const sceneNumber = sceneIndex + 1;
    const title = String(scene.title || scene.name || "").trim().toLowerCase();
    const sceneShots = list(scene.shots);

    if (!title) failures.push(`scene ${sceneNumber}: title missing`);
    if (title && sceneTitles.has(title)) {
      failures.push(`scene ${sceneNumber}: duplicate title`);
    }
    if (title) sceneTitles.add(title);

    if (!hasText(firstMeaningful(scene.objective, scene.purpose))) {
      failures.push(`scene ${sceneNumber}: objective missing`);
    }
    if (!hasText(firstMeaningful(
      scene.emotion,
      scene.emotional_function,
      scene.emotional_goal,
    ))) {
      failures.push(`scene ${sceneNumber}: emotional function missing`);
    }
    if (!sceneShots.length) failures.push(`scene ${sceneNumber}: no shots`);

    const sceneDuration = round(
      sceneShots.reduce(
        (total, shot) => total + Number(shot.duration_seconds || 0),
        0,
      ),
    );
    if (Math.abs(sceneDuration - Number(scene.duration_seconds || 0)) > 0.1) {
      failures.push(`scene ${sceneNumber}: scene duration does not equal shot duration`);
    }

    for (const [shotIndex, shot] of sceneShots.entries()) {
      const shotNumber = shotIndex + 1;
      const label = `scene ${sceneNumber} shot ${shotNumber}`;
      failures.push(
        ...shotFailures(
          shot,
          sceneNumber,
          shotNumber,
          assetIds.size > 0,
        ),
      );

      const shotTitle = String(shot.title || shot.name || "").trim().toLowerCase();
      if (shotTitle && shotTitles.has(shotTitle)) {
        failures.push(`${label}: duplicate title`);
      }
      if (shotTitle) shotTitles.add(shotTitle);

      const references = canonicalReferenceIds(shot);
      if (references.length) referencedShots.push(label);
      for (const id of references) {
        selectedAssetIds.add(id);
        if (!assetIds.has(id)) {
          failures.push(`${label}: unknown reference asset ${id}`);
        }
      }
    }
  }

  const totalDuration = round(
    shots.reduce(
      (total, shot) => total + Number(shot.duration_seconds || 0),
      0,
    ),
  );
  if (Math.abs(totalDuration - target) > 0.1) {
    failures.push(`total shot duration ${totalDuration}s does not equal target ${target}s`);
  }

  const beats = requiredStoryBeats(brief);
  const searchable = planText(plan);
  const missingBeats = beats.filter((beat) => {
    const terms = significantTerms(beat);
    return terms.length && !terms.some((term) => searchable.includes(term));
  });
  if (missingBeats.length) {
    failures.push(`required story beats missing: ${missingBeats.join(" | ")}`);
  }

  const referenceCoverage = shots.length
    ? referencedShots.length / shots.length
    : 0;
  if (assetIds.size && referenceCoverage < 0.8) {
    failures.push(
      `reference coverage ${Math.round(referenceCoverage * 100)}% is below 80%`,
    );
  }
  if (assetIds.size >= 3 && selectedAssetIds.size < 3) {
    warnings.push("fewer than three distinct canonical references selected");
  }

  const details = failures.map(failureDetail);

  const report = {
    passed: failures.length === 0,
    target_duration_seconds: target,
    total_duration_seconds: totalDuration,
    scene_count: scenes.length,
    scene_count_policy: "DYNAMIC_STORY_DECISION",
    shot_count: shots.length,
    shot_count_policy: "DYNAMIC_STORY_AND_EDIT_DECISION",
    referenced_shots: referencedShots.length,
    reference_coverage_percent: Math.round(referenceCoverage * 100),
    distinct_reference_assets: selectedAssetIds.size,
    required_story_beats: beats,
    missing_story_beats: missingBeats,
    failures,
    failure_details: details,
    failure_groups: failureGroups(details),
    warnings,
  };

  return {
    creativePlan: plan,
    report,
  };
}

export function enforceCreativeStoryboardPlan(input = {}) {
  const result = inspectCreativeStoryboardPlan(input);

  if (!result.report.passed) {
    const error = new Error("CREATIVE_STORYBOARD_PLAN_REJECTED");
    error.code = "CREATIVE_STORYBOARD_PLAN_REJECTED";
    error.details = result.report;
    throw error;
  }

  return result;
}
