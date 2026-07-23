const REQUIRED_ROLE_FIELDS = [
  "narrative_role",
  "action",
  "body_orientation",
  "gaze_target",
];

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

function roleId(actor = {}, index = 0) {
  return (
    text(actor.actor_id) ||
    text(actor.narrative_role) ||
    `role_${index + 1}`
  );
}

function compileRole(actor = {}, index = 0) {
  const identifiable = actor.must_be_visually_identifiable === true;
  const interactionTarget = text(actor.interaction_target);
  const travelDeclared = Boolean(
    text(actor.travel_direction) ||
    text(actor.start_position) ||
    text(actor.end_position),
  );
  const missing = [];

  if (identifiable) {
    for (const field of REQUIRED_ROLE_FIELDS) {
      if (!text(actor[field])) missing.push(field);
    }
  }

  if (interactionTarget && !text(actor.action)) {
    missing.push("action_for_declared_interaction");
  }

  if (travelDeclared) {
    if (!text(actor.start_position)) missing.push("start_position");
    if (!text(actor.end_position)) missing.push("end_position");
    if (!text(actor.travel_direction)) missing.push("travel_direction");
  }

  return {
    id: roleId(actor, index),
    narrative_role: text(actor.narrative_role) || null,
    count: Number(actor.count || 1),
    must_be_visually_identifiable: identifiable,
    action: text(actor.action) || null,
    start_position: text(actor.start_position) || null,
    end_position: text(actor.end_position) || null,
    travel_direction: text(actor.travel_direction) || null,
    body_orientation: text(actor.body_orientation) || null,
    gaze_target: text(actor.gaze_target) || null,
    interaction_target: interactionTarget || null,
    expression: text(actor.expression) || null,
    travel_declared: travelDeclared,
    interaction_declared: Boolean(interactionTarget),
    complete: missing.length === 0,
    missing: unique(missing),
  };
}

function compileVisibleTextPolicy(shot = {}) {
  const policy = object(shot.provider_text_policy);
  const overlays = list(shot.post_production_overlays);
  const approvedIds = unique(
    list(policy.approved_text_source_asset_ids).map(String),
  );
  const declared =
    Object.keys(policy).length > 0 ||
    overlays.length > 0;

  return {
    declared,
    provider_generation_allowed:
      policy.generate_text === true,
    provider_generation_disabled:
      policy.generate_text === false,
    controlled_composite_required:
      policy.controlled_composite_required === true,
    approved_source_asset_ids: approvedIds,
    overlays,
    instructions: text(policy.instructions) || null,
  };
}

function compileEvidencePolicy(scene = {}, shot = {}) {
  const grounding = text(
    shot.reference_grounding ||
    scene.reference_grounding,
  ).toUpperCase();
  const referenceIds = unique(
    list(shot.reference_asset_ids).map(String),
  );
  const missingEvidence = unique(shot.missing_evidence);

  return {
    grounding: grounding || null,
    reference_asset_ids: referenceIds,
    missing_evidence: missingEvidence,
    exact_claim_declared:
      grounding === "EXACT_REFERENCE_GROUNDED",
    approval_required:
      grounding === "CREATIVE_INTERPRETATION_REQUIRES_APPROVAL",
  };
}

export function compileCreativeNarrativeIntentContract({
  story = {},
  scene = {},
  shot = {},
} = {}) {
  const roles = list(shot.actors).map(compileRole);
  const purpose = text(
    shot.story_purpose ||
    shot.purpose ||
    scene.objective ||
    story.objective,
  );
  const decisiveMoment = text(shot.decisive_moment);
  const narrativeBefore = text(shot.narrative_state_before);
  const narrativeAfter = text(shot.narrative_state_after);
  const relationships = list(shot.relationships);
  const subjectPaths = list(shot.subject_paths);
  const actionBeats = list(shot.action_beats);
  const visibleText = compileVisibleTextPolicy(shot);
  const evidence = compileEvidencePolicy(scene, shot);
  const failures = [];

  if (!purpose) failures.push("NARRATIVE_PURPOSE_REQUIRED");
  if (!decisiveMoment) failures.push("DECISIVE_MOMENT_REQUIRED");
  if (!narrativeBefore) failures.push("NARRATIVE_STATE_BEFORE_REQUIRED");
  if (!narrativeAfter) failures.push("NARRATIVE_STATE_AFTER_REQUIRED");

  for (const role of roles) {
    if (!role.complete) {
      failures.push(
        `ROLE_CONTRACT_INCOMPLETE:${role.id}:${role.missing.join(",")}`,
      );
    }
  }

  if (
    evidence.exact_claim_declared &&
    evidence.reference_asset_ids.length === 0
  ) {
    failures.push("EXACT_EVIDENCE_REFERENCE_REQUIRED");
  }

  if (
    evidence.approval_required &&
    evidence.missing_evidence.length === 0
  ) {
    failures.push("CREATIVE_INTERPRETATION_MISSING_EVIDENCE_REQUIRED");
  }

  if (
    visibleText.provider_generation_allowed &&
    visibleText.controlled_composite_required
  ) {
    failures.push("TEXT_POLICY_CONTRADICTORY");
  }

  if (
    visibleText.controlled_composite_required &&
    visibleText.approved_source_asset_ids.length === 0
  ) {
    failures.push("CONTROLLED_COMPOSITE_SOURCE_REQUIRED");
  }

  return {
    version: "CREATIVE_NARRATIVE_INTENT_CONTRACT_V1",
    purpose,
    narrative_state_before: narrativeBefore || null,
    narrative_state_after: narrativeAfter || null,
    decisive_moment: decisiveMoment || null,
    screen_direction: text(shot.screen_direction) || null,
    environment_action: text(shot.environment_action) || null,
    roles,
    relationships,
    subject_paths: subjectPaths,
    action_beats: actionBeats,
    visible_text_policy: visibleText,
    evidence_policy: evidence,
    completeness: {
      complete: failures.length === 0,
      failures: unique(failures),
    },
  };
}

export function compileCreativeStoryIntentCoverage(story = {}) {
  const scenes = list(story.scenes);
  const contracts = [];
  const failures = [];

  scenes.forEach((scene, sceneIndex) => {
    const shots = list(scene.shots);

    if (!shots.length) {
      failures.push(`SCENE_WITHOUT_SHOTS:${sceneIndex + 1}`);
      return;
    }

    shots.forEach((shot, shotIndex) => {
      const contract = compileCreativeNarrativeIntentContract({
        story,
        scene,
        shot,
      });
      const key = `${sceneIndex + 1}:${shotIndex + 1}`;

      contracts.push({
        key,
        scene_number: sceneIndex + 1,
        shot_number: shotIndex + 1,
        title: shot.title || null,
        contract,
      });

      if (!contract.completeness.complete) {
        for (const failure of contract.completeness.failures) {
          failures.push(`${key}:${failure}`);
        }
      }
    });
  });

  return {
    version: "CREATIVE_STORY_INTENT_COVERAGE_V1",
    scene_count: scenes.length,
    shot_count: contracts.length,
    passed: failures.length === 0,
    failures: unique(failures),
    contracts,
  };
}
