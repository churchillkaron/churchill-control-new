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
  return normalized.length > 420
    ? `${normalized.slice(0, 417)}...`
    : normalized;
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
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
    actor.narrative_role ||
    actor.character ||
    actor.name ||
    actor.title ||
    actor.label,
  ) || `actor ${index + 1}`;
}

function referenceIds(shot = {}) {
  return unique([
    ...list(shot.reference_asset_ids),
    ...list(shot.assets),
    ...list(shot.reference_pack?.asset_ids),
    ...list(shot.reference_pack?.reference_asset_ids),
    ...list(shot.master_still_contract?.reference_asset_ids),
  ].map((entry) => (
    typeof entry === "string" || typeof entry === "number"
      ? entry
      : entry?.id || entry?.asset_id || entry?.reference_asset_id
  )));
}

function temporalFailureConditions(shot = {}) {
  const contract = object(shot.temporal_contract);
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

function shotAction(shot = {}) {
  return compact(
    firstMeaningful(
      shot.action_beats,
      shot.action,
      shot.performance_direction,
      shot.environment_action,
      shot.description,
      shot.purpose,
      shot.title,
    ),
    "the approved visible story action",
  );
}

function openingState(shot = {}) {
  return compact(
    firstMeaningful(
      shot.opening_frame,
      shot.opening_state,
      shot.frame_zero_description,
      shot.continuity?.entering,
      shot.continuity?.entering_state,
    ),
    "the approved opening state",
  );
}

function closingState(shot = {}) {
  return compact(
    firstMeaningful(
      shot.closing_frame,
      shot.closing_state,
      shot.end_frame,
      shot.continuity?.leaving,
      shot.continuity?.leaving_state,
    ),
    "the approved closing state",
  );
}

function shotSpecificFailurePrevention({
  shot,
  scene,
  sceneIndex,
  shotIndex,
}) {
  const label = `scene ${sceneIndex + 1} shot ${shotIndex + 1}`;
  const action = shotAction(shot);
  const opening = openingState(shot);
  const closing = closingState(shot);
  const actors = list(shot.actors);
  const roles = actors.map(actorRole);
  const references = referenceIds(shot);
  const scenePurpose = compact(
    firstMeaningful(
      scene.objective,
      scene.purpose,
      scene.title,
      scene.name,
    ),
    "the approved scene purpose",
  );

  return unique([
    ...list(shot.failure_prevention),
    ...list(shot.negative_constraints),
    ...list(shot.master_still_contract?.prohibited_changes),
    ...temporalFailureConditions(shot),
    `${label}: do not replace, reverse, dilute or ambiguously stage the approved action: ${action}.`,
    `${label}: the frame must begin from ${opening} and resolve to ${closing}; do not combine contradictory time states, reset the action or invent an alternate outcome.`,
    references.length
      ? `${label}: preserve the factual identity, architecture, spatial layout, products, wardrobe, signage and visible brand truth carried by reference assets ${references.join(", ")}; do not substitute generic or invented equivalents.`
      : `${label}: do not claim exact identity, venue, product, wardrobe, signage or brand fidelity where no approved reference establishes it.`,
    roles.length
      ? `${label}: keep the declared roles ${roles.join(", ")} individually readable; do not merge identities, swap roles, duplicate or remove people, reverse eyelines, break anatomy, lose object contact or reduce the performance to generic posing.`
      : `${label}: no human cast is declared; do not invent people, faces, bodies, reflections, shadows, dialogue, reactions or implied human activity.`,
    `${label}: preserve camera axis, lens logic, perspective, screen direction, focus strategy, exposure hierarchy, light direction, shadows, reflections, material response and environmental continuity across the shot and its editorial handoff.`,
    `${label}: do not invent visible text, logos, claims, products, props, doors, rooms, architecture, weather, crowd activity, sound sources or off-screen events not established by the approved scene evidence.`,
    `${label}: reject any result that fails the approved scene purpose ${scenePurpose}, introduces visible generation artifacts, breaks causal action, weakens commercial readability or cannot be verified against the shot's measurable quality requirements.`,
  ]);
}

function convergeShot({
  shot,
  scene,
  sceneIndex,
  shotIndex,
}) {
  const source = clone(shot) || {};
  const prevention = shotSpecificFailurePrevention({
    shot: source,
    scene,
    sceneIndex,
    shotIndex,
  });

  return {
    ...source,
    failure_prevention: prevention,
    negative_constraints: prevention,
    execution_contracts: {
      ...object(source.execution_contracts),
      failure_prevention: {
        version: "SHOT_SPECIFIC_FAILURE_PREVENTION_V1",
        complete: prevention.length > 0,
        scene_number: sceneIndex + 1,
        shot_number: shotIndex + 1,
        rule_count: prevention.length,
        generated_after_segmentation: true,
        validator_requirements_weakened: false,
      },
    },
  };
}

export function convergeCreativeFailurePrevention({
  creativePlan,
} = {}) {
  const plan = clone(creativePlan) || {};
  const scenes = list(plan.scenes).map((scene, sceneIndex) => ({
    ...scene,
    shots: list(scene.shots).map((shot, shotIndex) =>
      convergeShot({
        shot,
        scene,
        sceneIndex,
        shotIndex,
      }),
    ),
  }));
  const shotCount = scenes.reduce(
    (total, scene) => total + list(scene.shots).length,
    0,
  );

  return {
    ...plan,
    scenes,
    metadata: {
      ...object(plan.metadata),
      failure_prevention_convergence: {
        version: "SHOT_SPECIFIC_FAILURE_PREVENTION_V1",
        applied: true,
        scene_count: scenes.length,
        shot_count: shotCount,
        applied_at_storyboard_contract_boundary: true,
        applied_after_duration_segmentation: true,
        shot_specific: true,
        validator_requirements_weakened: false,
      },
    },
  };
}
