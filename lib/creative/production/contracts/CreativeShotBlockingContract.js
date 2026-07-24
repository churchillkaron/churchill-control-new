const CONTRACT_VERSION =
  "CREATIVE_SHOT_BLOCKING_CONTRACT_V1";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function referenceIds(value) {
  return unique(
    list(value).map((entry) => (
      typeof entry === "string" || typeof entry === "number"
        ? entry
        : entry?.id ||
          entry?.asset_id ||
          entry?.reference_asset_id
    )),
  );
}

function normalizePath(value, index) {
  const source = typeof value === "string"
    ? { action: value }
    : object(value);

  return {
    subject:
      text(
        source.subject ||
        source.actor ||
        source.role ||
        source.name,
      ) || `subject_${index + 1}`,
    action:
      text(
        source.action ||
        source.visible_action ||
        source.performance,
      ) || null,
    start_position:
      text(
        source.start_position ||
        source.from ||
        source.origin,
      ) || null,
    end_position:
      text(
        source.end_position ||
        source.to ||
        source.destination,
      ) || null,
    travel_direction:
      text(
        source.travel_direction ||
        source.direction ||
        source.screen_direction,
      ) || null,
    body_orientation:
      text(
        source.body_orientation ||
        source.orientation ||
        source.facing,
      ) || null,
    gaze_target:
      text(
        source.gaze_target ||
        source.eyeline ||
        source.looks_at,
      ) || null,
    interaction_target:
      text(
        source.interaction_target ||
        source.interacts_with ||
        source.relationship_target,
      ) || null,
    expression:
      text(
        source.expression ||
        source.emotional_read,
      ) || null,
    must_be_visually_identifiable:
      source.must_be_visually_identifiable !== false,
  };
}

function normalizeActor(actor, index) {
  const source = typeof actor === "string"
    ? { role: actor }
    : object(actor);
  const blocking = object(
    source.blocking || source.performance_blocking,
  );

  return {
    actor_id:
      text(source.id || source.actor_id) ||
      `actor_${index + 1}`,
    narrative_role:
      text(
        source.narrative_role ||
        source.role ||
        source.character ||
        source.name,
      ) || null,
    count: Math.max(1, Number(source.count || source.quantity || 1)),
    action:
      text(
        blocking.action ||
        source.action ||
        source.visible_action ||
        source.performance_action,
      ) || null,
    start_position:
      text(
        blocking.start_position ||
        source.start_position ||
        source.position,
      ) || null,
    end_position:
      text(
        blocking.end_position ||
        source.end_position ||
        source.destination,
      ) || null,
    travel_direction:
      text(
        blocking.travel_direction ||
        source.travel_direction ||
        source.movement_direction,
      ) || null,
    body_orientation:
      text(
        blocking.body_orientation ||
        source.body_orientation ||
        source.orientation ||
        source.facing,
      ) || null,
    gaze_target:
      text(
        blocking.gaze_target ||
        source.gaze_target ||
        source.eyeline ||
        source.looks_at,
      ) || null,
    interaction_target:
      text(
        blocking.interaction_target ||
        source.interaction_target ||
        source.interacts_with,
      ) || null,
    expression:
      text(
        blocking.expression ||
        source.expression ||
        source.emotional_read,
      ) || null,
    wardrobe:
      source.wardrobe || source.costume || null,
    identity_reference_asset_ids: referenceIds(
      source.identity_reference_asset_ids ||
      source.reference_asset_ids ||
      source.identity_reference_asset_id ||
      source.reference_asset_id,
    ),
    must_be_visually_identifiable:
      source.must_be_visually_identifiable !== false,
  };
}

function actorCompleteness(actor) {
  const missing = [];

  if (!actor.narrative_role) missing.push("narrative_role");
  if (!actor.action) missing.push("action");
  if (!actor.start_position) missing.push("start_position");
  if (!actor.body_orientation) missing.push("body_orientation");
  if (!actor.gaze_target) missing.push("gaze_target");

  const movementDeclared = Boolean(
    actor.end_position || actor.travel_direction,
  );
  if (movementDeclared && !actor.end_position) {
    missing.push("end_position");
  }
  if (movementDeclared && !actor.travel_direction) {
    missing.push("travel_direction");
  }

  return missing;
}

export function compileCreativeShotBlockingContract({
  scene = {},
  shot = {},
} = {}) {
  const sceneSource = object(scene);
  const shotSource = object(shot);
  const explicit = object(
    shotSource.blocking_contract ||
    shotSource.blocking,
  );
  const sceneActors = list(sceneSource.actors);
  const shotActors = list(shotSource.actors);
  const actors = (shotActors.length ? shotActors : sceneActors)
    .map(normalizeActor);
  const subjectPaths = list(
    explicit.subject_paths ||
    shotSource.subject_paths ||
    explicit.paths,
  ).map(normalizePath);
  const forbiddenInterpretations = unique([
    ...list(explicit.forbidden_interpretations),
    ...list(shotSource.forbidden_interpretations),
    ...list(shotSource.negative_constraints),
  ]);
  const storyPurpose = text(
    explicit.story_purpose ||
    shotSource.story_purpose ||
    shotSource.purpose ||
    sceneSource.objective,
  );
  const openingFrame = text(
    explicit.opening_frame || shotSource.opening_frame,
  );
  const closingFrame = text(
    explicit.closing_frame || shotSource.closing_frame,
  );
  const decisiveMoment = text(
    explicit.decisive_moment ||
    shotSource.decisive_moment,
  );
  const environmentAction = text(
    explicit.environment_action ||
    shotSource.environment_action,
  );
  const actionBeats = list(shotSource.action_beats)
    .map((beat) => (
      typeof beat === "string"
        ? beat
        : beat?.action ||
          beat?.description ||
          beat?.beat
    ))
    .map(text)
    .filter(Boolean);
  const missing = [];

  if (!storyPurpose) missing.push("story_purpose");
  if (!openingFrame) missing.push("opening_frame");
  if (!closingFrame) missing.push("closing_frame");
  if (!decisiveMoment) missing.push("decisive_moment");
  if (!actionBeats.length && !environmentAction && !actors.length) {
    missing.push("visible_action_or_environment_action");
  }
  if (!forbiddenInterpretations.length) {
    missing.push("forbidden_interpretations");
  }

  const actorFailures = actors
    .map((actor, index) => ({
      actor_id: actor.actor_id || `actor_${index + 1}`,
      missing: actorCompleteness(actor),
    }))
    .filter((entry) => entry.missing.length);

  return {
    version: CONTRACT_VERSION,
    story_purpose: storyPurpose || null,
    narrative_state_before:
      text(
        explicit.narrative_state_before ||
        shotSource.narrative_state_before ||
        shotSource.continuity?.before,
      ) || null,
    narrative_state_after:
      text(
        explicit.narrative_state_after ||
        shotSource.narrative_state_after ||
        shotSource.continuity?.after,
      ) || null,
    opening_frame: openingFrame || null,
    closing_frame: closingFrame || null,
    decisive_moment: decisiveMoment || null,
    screen_direction:
      text(
        explicit.screen_direction ||
        shotSource.screen_direction ||
        shotSource.continuity?.screen_direction,
      ) || null,
    camera_position:
      text(
        explicit.camera_position ||
        shotSource.camera?.position,
      ) || null,
    environment_action: environmentAction || null,
    action_beats: actionBeats,
    actors,
    subject_paths: subjectPaths,
    relationships: list(
      explicit.relationships ||
      shotSource.relationships,
    ),
    foreground_action:
      explicit.foreground_action || null,
    midground_action:
      explicit.midground_action || null,
    background_action:
      explicit.background_action || null,
    reference_grounding:
      text(
        explicit.reference_grounding ||
        shotSource.reference_grounding,
      ) || "UNDECLARED",
    forbidden_interpretations: forbiddenInterpretations,
    still_frame_rules: unique([
      "RENDER_ONE_DECISIVE_STATIC_MOMENT_ONLY",
      "SUBJECT_DIRECTION_MUST_MATCH_DECLARED_PATHS",
      "BODY_ORIENTATION_GAZE_AND_INTERACTION_MUST_AGREE",
      "CAMERA_MOVEMENT_LANGUAGE_MUST_NOT_OVERRIDE_STORY_BLOCKING",
      "DO_NOT_INVENT_OPPOSITE_OR_AMBIGUOUS_ACTION",
      ...list(explicit.still_frame_rules),
    ]),
    completeness: {
      complete:
        missing.length === 0 &&
        actorFailures.length === 0,
      missing,
      actor_failures: actorFailures,
    },
  };
}

export function assertCreativeShotBlockingContract(contract = {}) {
  if (contract?.completeness?.complete === true) {
    return contract;
  }

  const error = new Error(
    "CREATIVE_SHOT_BLOCKING_CONTRACT_INCOMPLETE",
  );
  error.code = error.message;
  error.details = {
    contract_version: contract?.version || null,
    missing: contract?.completeness?.missing || [],
    actor_failures:
      contract?.completeness?.actor_failures || [],
  };
  throw error;
}
