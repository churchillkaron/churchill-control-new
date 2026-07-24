function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compact(value, fallback) {
  const normalized = typeof value === "string"
    ? text(value)
    : text(JSON.stringify(value || ""));

  if (!normalized) return fallback;
  return normalized.length > 520
    ? `${normalized.slice(0, 517)}...`
    : normalized;
}

function firstMeaningful(...values) {
  return values.find((value) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return Boolean(value.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  });
}

function actorRole(actor = {}, index = 0) {
  return text(
    actor.role ||
      actor.character ||
      actor.name ||
      actor.title ||
      actor.label,
  ) || `actor ${index + 1}`;
}

function authoredPerformanceDirection(shot = {}) {
  const existing = firstMeaningful(
    shot.performance_direction,
    shot.performance_contract?.direction,
    shot.performance?.direction,
  );

  if (existing) {
    return compact(existing, "Preserve the approved authored performance direction.");
  }

  const actors = list(shot.actors);
  const roles = actors.map(actorRole);
  const action = compact(
    firstMeaningful(
      shot.action_beats,
      shot.action,
      shot.description,
      shot.purpose,
      shot.objective,
      shot.title,
    ),
    "hold the approved state without introducing unplanned action",
  );
  const opening = compact(
    firstMeaningful(
      shot.opening_frame,
      shot.opening_state,
      shot.continuity?.entering,
    ),
    "the approved opening state",
  );
  const closing = compact(
    firstMeaningful(
      shot.closing_frame,
      shot.closing_state,
      shot.end_frame,
      shot.continuity?.leaving,
    ),
    "the approved closing state",
  );

  if (!actors.length) {
    return [
      "No human performance is authored for this production beat; preserve the absence of people, faces, bodies, reflections, shadows and implied human movement.",
      `Animate only the approved object, camera and environmental action: ${action}.`,
      `Begin from ${opening} and complete at ${closing} without invented characters, gestures, dialogue or reactions.`,
    ].join(" ");
  }

  const actorEvidence = actors.map((actor, index) => {
    const role = actorRole(actor, index);
    const blocking = object(actor.blocking);
    return [
      `${role}:`,
      `start ${compact(firstMeaningful(actor.starting_position, blocking.starting_position), opening)};`,
      `move ${compact(firstMeaningful(actor.movement_path, blocking.movement_path), action)};`,
      `eye line ${compact(firstMeaningful(actor.eye_line, blocking.eye_line), "motivated by the approved action and never toward camera unless explicitly authored")};`,
      `gesture ${compact(firstMeaningful(actor.gesture, blocking.gesture), "restrained, natural and synchronized to the approved action")};`,
      `reaction timing ${compact(firstMeaningful(actor.reaction_timing, blocking.reaction_timing), "causal and completed before the closing state")};`,
      `object contact ${compact(firstMeaningful(actor.object_contact, blocking.object_contact), "only with explicitly established objects using anatomically credible contact")}.`,
    ].join(" ");
  });

  return [
    `Direct ${roles.join(", ")} to execute only the approved action: ${action}.`,
    ...actorEvidence,
    `Preserve identity, anatomy, wardrobe, handedness, screen direction, spatial relationships and emotional continuity from ${opening} to ${closing}.`,
    "Performance must be physically credible, causal and non-looping, with no mirrored motion, repeated gesture, exaggerated expression, identity drift, invented dialogue or unplanned behavior.",
  ].join(" ");
}

function convergeShot(shot = {}) {
  const source = clone(shot) || {};
  const actors = list(source.actors);
  const performanceDirection = authoredPerformanceDirection(source);

  return {
    ...source,
    performance_direction: performanceDirection,
    performance_contract: {
      ...object(source.performance_contract),
      direction: performanceDirection,
      actor_roles: actors.map(actorRole),
      opening_state: firstMeaningful(
        source.performance_contract?.opening_state,
        source.opening_frame,
        source.opening_state,
        source.continuity?.entering,
      ) || null,
      closing_state: firstMeaningful(
        source.performance_contract?.closing_state,
        source.closing_frame,
        source.closing_state,
        source.end_frame,
        source.continuity?.leaving,
      ) || null,
      source: source.performance_direction
        ? "AUTHORED_PERFORMANCE_DIRECTION"
        : "EVIDENCE_DERIVED_EXECUTION_CONTRACT",
      factual_invention_allowed: false,
      identity_invention_allowed: false,
    },
  };
}

export function convergeCreativePerformanceDirections({
  creativePlan,
} = {}) {
  const plan = clone(creativePlan) || {};
  const scenes = list(plan.scenes).map((scene) => ({
    ...scene,
    shots: list(scene.shots).map(convergeShot),
  }));

  return {
    ...plan,
    scenes,
    metadata: {
      ...object(plan.metadata),
      performance_direction_convergence: {
        version: "POST_SEGMENTATION_PERFORMANCE_DIRECTION_V1",
        applied: true,
        scene_count: scenes.length,
        shot_count: scenes.reduce(
          (total, scene) => total + list(scene.shots).length,
          0,
        ),
        applied_after_duration_segmentation: true,
        factual_invention_allowed: false,
        validator_requirements_weakened: false,
      },
    },
  };
}
