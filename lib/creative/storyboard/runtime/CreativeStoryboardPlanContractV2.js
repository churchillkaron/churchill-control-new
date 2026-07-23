import {
  inspectCreativeShotTemporalContract,
} from "@/lib/creative/director/runtime/CreativeShotTemporalContract";

const ROUNDING = 10;
const MAX_SHOT_DURATION_SECONDS = 15;

const CAMERA_REQUIREMENTS = {
  framing: [
    "framing", "shot size", "frame size", "composition",
    "headroom", "lead room", "coverage", "close up",
    "medium shot", "wide shot",
  ],
  movement: [
    "movement", "camera motion", "dolly", "pan", "tilt",
    "truck", "pedestal", "crane", "orbit", "push", "pull",
    "locked", "static", "handheld", "gimbal", "steadicam",
  ],
  lens: [
    "lens", "focal", "field of view", "depth of field", "mm",
  ],
  angle: [
    "angle", "eye level", "low angle", "high angle", "overhead",
    "profile", "three quarter", "three-quarter",
  ],
  camera_height: [
    "camera height", "height", "eye level", "waist level",
    "chest level", "ground level", "overhead",
  ],
  start_position: [
    "start position", "camera start", "initial position", "opening position",
    "frame 0", "frame zero", "initial state",
  ],
  end_position: [
    "end position", "camera end", "final position", "closing position",
    "final state",
  ],
  support: [
    "support", "tripod", "dolly", "gimbal", "handheld", "crane",
    "jib", "steadicam", "locked off", "locked-off",
  ],
  movement_speed: [
    "movement speed", "speed", "pace", "velocity", "slow", "fast",
    "measured", "controlled", "tempo",
  ],
  focus_strategy: [
    "focus strategy", "focus", "rack focus", "focus plane", "sharp",
    "bokeh", "depth of field",
  ],
  composition: [
    "composition", "framing", "rule of thirds", "centered", "symmetry",
    "negative space", "headroom", "lead room",
  ],
};

const LIGHTING_REQUIREMENTS = {
  source_positions: [
    "source position", "source positions", "key light", "fill light",
    "rim light", "edge light", "practical", "window light", "overhead",
    "backlight", "camera left", "camera right", "above", "behind",
  ],
  key_fill_edge: [
    "key fill edge", "key/fill/edge", "key light", "fill light",
    "edge light", "rim light", "backlight", "lighting ratio",
  ],
  color_temperature: [
    "color temperature", "temperature", "kelvin", "warm", "cool",
    "daylight", "tungsten", "white balance",
  ],
  exposure_hierarchy: [
    "exposure hierarchy", "exposure priority", "exposure", "brightest",
    "protect highlights", "shadow detail", "priority",
  ],
  contrast: [
    "contrast", "contrast ratio", "high key", "low key", "soft light",
    "hard light", "falloff",
  ],
  continuity: [
    "continuity", "lighting continuity", "immutable", "lock", "stable",
    "preserve", "handoff",
  ],
};

const ACTOR_REQUIREMENTS = {
  starting_position: [
    "starting position", "start position", "initial position", "initial state",
    "opening position", "frame 0", "frame zero",
  ],
  movement_path: [
    "movement path", "path", "blocking", "position", "crosses", "moves",
    "approaches", "turns", "steps", "walks", "sits", "stands",
  ],
  eye_line: [
    "eye line", "eyeline", "gaze", "looks", "look target", "focuses on",
  ],
  gesture: [
    "gesture", "hand", "arm", "body", "posture", "expression", "face",
    "breath", "nod", "smile", "reaction",
  ],
  reaction_timing: [
    "reaction timing", "timing", "beat", "reacts", "responds", "pause",
    "keyframe", "at_ms", "start_ms", "end_ms",
  ],
  object_contact: [
    "object contact", "contact", "touch", "hold", "grip", "place", "pick",
    "hand", "object", "product", "glass", "door", "table", "no contact",
  ],
};

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

function normalizedText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceFragments(value, prefix = "", depth = 0) {
  if (depth > 10 || value === undefined || value === null) return [];

  if (["string", "number", "boolean"].includes(typeof value)) {
    return [normalizedText(`${prefix} ${value}`)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      evidenceFragments(item, `${prefix} ${index + 1}`, depth + 1),
    );
  }

  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => [
      normalizedText(`${prefix} ${key}`),
      ...evidenceFragments(item, `${prefix} ${key}`, depth + 1),
    ]);
  }

  return [];
}

function evidenceText(...values) {
  return unique(
    values.flatMap((value) => evidenceFragments(value)),
  ).join(" | ");
}

function containsEvidence(corpus, aliases = []) {
  const source = normalizedText(corpus);
  return aliases.some((alias) => source.includes(normalizedText(alias)));
}

function departmentEvidence(contract = {}, departmentName) {
  const department = object(contract[departmentName]);
  return {
    department,
    tracks: list(department.tracks),
    events: list(department.events),
    corpus: evidenceText(
      department.tracks,
      department.events,
      department.immutable_locks,
      department.directed_evolution,
      department.failure_conditions,
    ),
  };
}

function temporalInspection(shot = {}, label = "shot") {
  try {
    return inspectCreativeShotTemporalContract({
      shot,
      fps: Number(shot.temporal_contract?.fps || 30),
      label,
    });
  } catch {
    return {
      contract: {},
      report: {
        passed: false,
        failures: [`${label}: temporal contract inspection failed`],
      },
    };
  }
}

function departmentPassed(inspection, departmentName) {
  const department = object(inspection.contract?.[departmentName]);
  const hasDirection =
    list(department.tracks).length > 0 ||
    list(department.events).length > 0;
  const marker = ` ${departmentName} `;
  const failures = list(inspection.report?.failures).map((failure) =>
    normalizedText(` ${failure} `),
  );

  return hasDirection && !failures.some((failure) =>
    failure.includes(marker) ||
    failure.includes(`${departmentName} temporal direction missing`),
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

function canonicalReferenceIds(shot = {}) {
  return unique([
    ...list(shot.reference_asset_ids),
    ...list(shot.assets),
    ...list(shot.master_still_contract?.reference_asset_ids),
  ]);
}

function canonicalContinuity(shot = {}, inspection = {}) {
  const normalized = object(inspection.contract?.continuity);
  const temporal = object(shot.temporal_contract?.continuity);
  const contract = object(shot.continuity_contract);
  const direct = object(shot.continuity);

  return {
    ...normalized,
    ...temporal,
    ...contract,
    ...direct,
    entering: firstMeaningful(
      direct.entering,
      direct.entering_state,
      contract.entering,
      contract.entering_state,
      temporal.entering,
      temporal.entering_state,
      normalized.entering_state,
    ) || "",
    leaving: firstMeaningful(
      direct.leaving,
      direct.leaving_state,
      contract.leaving,
      contract.leaving_state,
      temporal.leaving,
      temporal.leaving_state,
      normalized.leaving_state,
    ) || "",
    locks: firstList(
      direct.locks,
      contract.locks,
      temporal.locks,
      normalized.locks,
      inspection.contract?.immutable_locks,
    ),
    handoff_requirements: firstList(
      direct.handoff_requirements,
      contract.handoff_requirements,
      temporal.handoff_requirements,
      normalized.handoff_requirements,
    ),
  };
}

function canonicalReferencePack(shot = {}, inspection = {}) {
  const direct = object(shot.reference_pack);
  const contract = firstObject(
    shot.reference_contract,
    shot.reference_rules,
  );
  const master = object(
    inspection.contract?.master_still ||
    shot.master_still_contract,
  );

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

function temporalTrackRules(contract = {}, departments = []) {
  return departments.flatMap((department) =>
    list(contract?.[department]?.tracks)
      .flatMap((track) => list(track?.physical_rules)),
  );
}

function temporalFailureConditions(contract = {}) {
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
    list(contract?.[department]?.failure_conditions),
  );
}

function canonicalRealityRules(shot = {}, inspection = {}) {
  const direct = firstObject(
    shot.reality_rules,
    shot.physical_reality_rules,
  );
  const contract = object(inspection.contract);

  return {
    ...direct,
    human: firstList(
      direct.human,
      temporalTrackRules(contract, ["performance"]),
    ),
    physical: firstList(
      direct.physical,
      temporalTrackRules(contract, [
        "camera",
        "objects_products",
        "focus_exposure",
      ]),
    ),
    environment: firstList(
      direct.environment,
      temporalTrackRules(contract, [
        "lighting",
        "environment",
      ]),
    ),
  };
}

function canonicalQualityRequirements(shot = {}, inspection = {}) {
  const direct = object(shot.quality_requirements);
  const temporal = object(inspection.contract?.quality_requirements);
  const approvals = list(
    inspection.contract?.master_still?.approval_requirements ||
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

function canonicalNegativeConstraints(shot = {}, inspection = {}) {
  return firstList(
    shot.negative_constraints,
    shot.failure_prevention,
    inspection.contract?.master_still?.prohibited_changes,
    shot.master_still_contract?.prohibited_changes,
    temporalFailureConditions(inspection.contract),
  );
}

function cameraFailures(shot, label, inspection) {
  const failures = [];
  const camera = mergedObjects(
    inspection.contract?.master_still?.exact_camera_state,
    shot.master_still_contract?.exact_camera_state,
    shot.camera_contract,
    shot.cinematography,
    shot.camera,
  );
  const evidence = departmentEvidence(
    inspection.contract,
    "camera",
  );
  const passed = departmentPassed(inspection, "camera");
  const corpus = evidenceText(camera, evidence.department);

  if (!hasObjectValues(camera) && !passed) {
    failures.push(`${label}: camera contract missing`);
    return failures;
  }

  const missing = Object.entries(CAMERA_REQUIREMENTS)
    .filter(([key, aliases]) => {
      const direct = firstMeaningful(
        camera[key],
        ...aliases.map((alias) =>
          camera[alias.replace(/\s+/g, "_")],
        ),
      );
      return !direct && !containsEvidence(corpus, aliases);
    })
    .map(([key]) => key);

  const motivationPresent = Boolean(
    firstMeaningful(
      camera.motivation,
      camera.reason,
      camera.rationale,
      camera.intent,
    ) ||
    (
      passed &&
      [
        ...evidence.tracks.flatMap((track) =>
          list(track.keyframes).map((keyframe) => keyframe?.motivation),
        ),
        ...evidence.events.map((event) => event?.motivation),
      ].filter(meaningful).length
    )
  );

  if (!motivationPresent) missing.push("motivation");

  if (missing.length) {
    failures.push(`${label}: camera detail missing ${unique(missing).join(", ")}`);
  }

  return failures;
}

function lightingFailures(shot, label, inspection) {
  const failures = [];
  const lighting = mergedObjects(
    inspection.contract?.master_still?.exact_lighting_state,
    shot.master_still_contract?.exact_lighting_state,
    shot.lighting_contract,
    shot.production_design?.lighting,
    shot.lighting,
  );
  const evidence = departmentEvidence(
    inspection.contract,
    "lighting",
  );
  const passed = departmentPassed(inspection, "lighting");
  const corpus = evidenceText(lighting, evidence.department);

  if (!hasObjectValues(lighting) && !passed) {
    failures.push(`${label}: lighting contract missing`);
    return failures;
  }

  const missing = Object.entries(LIGHTING_REQUIREMENTS)
    .filter(([key, aliases]) => {
      const direct = firstMeaningful(
        lighting[key],
        ...aliases.map((alias) =>
          lighting[alias.replace(/\s+/g, "_")],
        ),
      );
      return !direct && !containsEvidence(corpus, aliases);
    })
    .map(([key]) => key);

  const motivationPresent = Boolean(
    firstMeaningful(
      lighting.motivation,
      lighting.reason,
      lighting.rationale,
      lighting.intent,
    ) ||
    (
      passed &&
      [
        ...evidence.tracks.flatMap((track) =>
          list(track.keyframes).map((keyframe) => keyframe?.motivation),
        ),
        ...evidence.events.map((event) => event?.motivation),
      ].filter(meaningful).length
    )
  );

  if (!motivationPresent) missing.push("motivation");

  if (missing.length) {
    failures.push(`${label}: lighting detail missing ${unique(missing).join(", ")}`);
  }

  return failures;
}

function referenceFailures(shot, label, assetsAvailable, inspection) {
  const failures = [];
  const pack = canonicalReferencePack(shot, inspection);
  const continuity = canonicalContinuity(shot, inspection);
  const references = canonicalReferenceIds(shot);

  if (!hasObjectValues(pack)) failures.push(`${label}: reference pack missing`);
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

function physicalRealityFailures(shot, label, inspection) {
  const failures = [];
  const rules = canonicalRealityRules(shot, inspection);

  if (!hasObjectValues(rules)) {
    failures.push(`${label}: physical reality rules missing`);
    return failures;
  }

  const missing = ["human", "physical", "environment"]
    .filter((key) => !list(rules[key]).length);

  if (missing.length) {
    failures.push(`${label}: physical reality categories missing ${missing.join(", ")}`);
  }

  return failures;
}

function soundAndEditFailures(shot, label, inspection) {
  const failures = [];
  const editorial = object(inspection.contract?.editorial);
  const sound = object(inspection.contract?.sound);

  const transitionIn = firstObject(
    shot.transition_in,
    shot.edit_contract?.transition_in,
    shot.editorial_contract?.transition_in,
    editorial.transition_in,
    editorial.entry_transition,
  );
  const transitionOut = firstObject(
    shot.transition_out,
    shot.edit_contract?.transition_out,
    shot.editorial_contract?.transition_out,
    editorial.transition_out,
    editorial.exit_transition,
  );
  const editorialPassed = departmentPassed(inspection, "editorial");

  if (!hasObjectValues(transitionIn) && !editorialPassed) {
    failures.push(`${label}: transition-in direction missing`);
  }
  if (!hasObjectValues(transitionOut) && !editorialPassed) {
    failures.push(`${label}: transition-out direction missing`);
  }

  const explicitSound = Boolean(
    hasObjectValues(shot.music) ||
    list(shot.sound_effects).length ||
    list(shot.dialogue).length ||
    hasObjectValues(shot.narration),
  );

  if (!explicitSound && !departmentPassed(inspection, "sound")) {
    failures.push(`${label}: sound direction missing`);
  }

  const post = firstObject(
    shot.post_production,
    shot.post_production_contract,
    shot.edit_contract,
    shot.editorial_contract,
  );

  if (!hasObjectValues(post) && !editorialPassed) {
    failures.push(`${label}: post-production ownership missing`);
  }

  return failures;
}

function actorIdentityTokens(actor = {}) {
  return unique([
    actor.id,
    actor.actor_id,
    actor.character_id,
    actor.name,
    actor.title,
    actor.character,
    actor.role,
    actor.label,
  ]).map(normalizedText).filter(Boolean);
}

function actorTemporalEvidence(actor, actors, performance) {
  const allTracks = list(performance.tracks);
  const allEvents = list(performance.events);
  const tokens = actorIdentityTokens(actor);

  if (actors.length === 1) {
    return {
      tracks: allTracks,
      events: allEvents,
    };
  }

  const matches = (value) => {
    const corpus = evidenceText(value);
    return tokens.length && tokens.some((token) => corpus.includes(token));
  };

  return {
    tracks: allTracks.filter(matches),
    events: allEvents.filter(matches),
  };
}

function directActorBehavior(actor = {}) {
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

function actorBehaviorFailures(actor, actors, performance) {
  const direct = directActorBehavior(actor);
  const evidence = actorTemporalEvidence(
    actor,
    actors,
    performance,
  );
  const corpus = evidenceText(
    evidence.tracks,
    evidence.events,
  );

  return Object.entries(ACTOR_REQUIREMENTS)
    .filter(([key, aliases]) => {
      if (meaningful(direct[key])) return false;

      if (key === "starting_position") {
        return !evidence.tracks.some((track) =>
          meaningful(track.initial_state) ||
          list(track.keyframes).some((frame) =>
            Number(frame?.at_ms) === 0 && meaningful(frame?.state),
          ),
        );
      }

      if (key === "movement_path") {
        const stateChange = evidence.tracks.some((track) =>
          meaningful(track.initial_state) &&
          meaningful(track.final_state) &&
          JSON.stringify(track.initial_state) !== JSON.stringify(track.final_state),
        );
        return !stateChange && !containsEvidence(corpus, aliases);
      }

      if (key === "reaction_timing") {
        const timed =
          evidence.events.length > 0 ||
          evidence.tracks.some((track) => list(track.keyframes).length >= 2);
        return !timed && !containsEvidence(corpus, aliases);
      }

      return !containsEvidence(corpus, aliases);
    })
    .map(([key]) => key);
}

function performanceFailures(shot, label, inspection) {
  const failures = [];
  const performance = object(inspection.contract?.performance);
  const passed = departmentPassed(inspection, "performance");

  const direction = firstMeaningful(
    shot.performance_direction,
    shot.blocking_direction,
    shot.performance_contract?.direction,
    shot.performance_contract?.summary,
  );

  if (!hasText(direction) && !passed) {
    failures.push(`${label}: performance direction missing`);
  }

  const actionBeats = firstList(
    shot.action_beats,
    shot.performance_contract?.action_beats,
    shot.performance_contract?.beats,
    performance.events,
  );

  if (!actionBeats.length && !list(performance.tracks).length) {
    failures.push(`${label}: action beats missing`);
  }

  const actors = list(shot.actors);
  for (const [index, actor] of actors.entries()) {
    const missing = actorBehaviorFailures(
      actor,
      actors,
      performance,
    );

    if (missing.length) {
      failures.push(
        `${label} actor ${index + 1}: blocking or behavior incomplete ${missing.join(", ")}`,
      );
    }
  }

  return failures;
}

function shotFailures(shot, sceneNumber, shotNumber, assetsAvailable) {
  const failures = [];
  const label = `scene ${sceneNumber} shot ${shotNumber}`;
  const inspection = temporalInspection(shot, label);
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
    ...cameraFailures(shot, label, inspection),
    ...lightingFailures(shot, label, inspection),
    ...performanceFailures(shot, label, inspection),
    ...referenceFailures(shot, label, assetsAvailable, inspection),
    ...physicalRealityFailures(shot, label, inspection),
    ...soundAndEditFailures(shot, label, inspection),
  );

  if (!canonicalNegativeConstraints(shot, inspection).length) {
    failures.push(`${label}: shot-specific failure prevention missing`);
  }
  if (!hasObjectValues(canonicalQualityRequirements(shot, inspection))) {
    failures.push(`${label}: measurable quality requirements missing`);
  }

  return failures;
}

function normalizeShot(shot = {}, shotIndex = 0) {
  const output = clone(shot) || {};
  const inspection = temporalInspection(output);
  const references = canonicalReferenceIds(output);

  output.shot_number = shotIndex + 1;
  output.duration_seconds = Number(
    output.duration_seconds ??
    output.duration ??
    0,
  );
  output.reference_asset_ids = references;
  output.assets = references;
  output.continuity = canonicalContinuity(output, inspection);
  output.reference_pack = canonicalReferencePack(output, inspection);
  output.reality_rules = canonicalRealityRules(output, inspection);
  output.negative_constraints = canonicalNegativeConstraints(output, inspection);
  output.quality_requirements = canonicalQualityRequirements(output, inspection);

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
  return String(failure)
    .replace(/^scene\s+\d+(?:\s+shot\s+\d+)?(?:\s+actor\s+\d+)?:\s*/i, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase() || "STORYBOARD_CONTRACT_FAILURE";
}

function failureFields(failure = "") {
  const value = String(failure);
  const match = value.match(
    /(?:detail missing|categories missing|behavior incomplete)\s+(.+)$/i,
  );
  if (match) {
    return match[1]
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
    version: "canonical-temporal-evidence-v2",
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
