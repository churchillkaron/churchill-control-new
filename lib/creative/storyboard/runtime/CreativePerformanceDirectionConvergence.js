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

function meaningful(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function firstMeaningful(...values) {
  return values.find(meaningful);
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

function shotPurpose(shot = {}) {
  return compact(
    firstMeaningful(
      shot.purpose,
      shot.objective,
      shot.title,
      shot.description,
    ),
    "the approved editorial purpose",
  );
}

function shotAction(shot = {}) {
  return compact(
    firstMeaningful(
      shot.action_beats,
      shot.action,
      shot.performance_direction,
      shot.description,
      shot.purpose,
      shot.title,
    ),
    "hold the approved state without introducing unplanned action",
  );
}

function openingState(shot = {}) {
  return compact(
    firstMeaningful(
      shot.opening_frame,
      shot.opening_state,
      shot.continuity?.entering,
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
    ),
    "the approved closing state",
  );
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
  const action = shotAction(shot);
  const opening = openingState(shot);
  const closing = closingState(shot);

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

function isInternalContinuation(shot = {}) {
  return Boolean(
    Number(shot.production_segment?.segment_index || 0) > 1 ||
      Number(shot.authored_sequence?.section_index || 0) > 1 ||
      shot.transition_in?.internal_production_join === true ||
      shot.transition_in?.internal_editorial_join === true,
  );
}

function isInternalHandoff(shot = {}) {
  const segment = object(shot.production_segment);
  const section = object(shot.authored_sequence);

  return Boolean(
    (
      Number(segment.segment_count || 0) > 1 &&
      Number(segment.segment_index || 0) < Number(segment.segment_count || 0)
    ) ||
      (
        Number(section.section_count || 0) > 1 &&
        Number(section.section_index || 0) < Number(section.section_count || 0)
      ) ||
      shot.transition_out?.internal_production_join === true ||
      shot.transition_out?.internal_editorial_join === true,
  );
}

function convergeTransitionIn({
  shot,
  sceneIndex,
  shotIndex,
  globalShotIndex,
}) {
  const source = object(shot.transition_in);
  const internal = isInternalContinuation(shot);
  const firstShot = globalShotIndex === 0;
  const type = firstMeaningful(
    source.type,
    source.transition_type,
    internal ? "MATCH_CUT" : firstShot ? "DIRECT_OPEN" : "MOTIVATED_CUT",
  );
  const direction = firstMeaningful(
    source.direction,
    source.description,
    source.instruction,
  ) || (
    internal
      ? `Begin on the exact final frame, camera axis, action phase, identity state, lighting state, sound state and environmental motion delivered by the preceding production beat: ${openingState(shot)}`
      : firstShot
        ? `Open directly on the approved frame-zero composition with no pre-roll, invented establishing image or unapproved title card: ${openingState(shot)}`
        : `Enter on the approved opening state only after the preceding shot's motivated action, look, camera move, sound cue or visual geometry resolves: ${openingState(shot)}`
  );

  return {
    ...source,
    type,
    direction,
    motivation: firstMeaningful(
      source.motivation,
      source.reason,
      internal
        ? "Preserve seamless temporal and spatial continuity inside the same authored sequence."
        : firstShot
          ? "Establish the approved story and visual hierarchy immediately."
          : `Advance the approved editorial purpose: ${shotPurpose(shot)}.`,
    ),
    continuity_requirements: firstMeaningful(
      source.continuity_requirements,
      source.continuity,
      "Preserve identity, anatomy, wardrobe, props, products, geography, camera axis, screen direction, lighting direction, reflections, shadows, sound perspective and environmental motion across the edit.",
    ),
    duration_frames: Number.isFinite(Number(source.duration_frames))
      ? Number(source.duration_frames)
      : 0,
    scene_number: sceneIndex + 1,
    shot_number: shotIndex + 1,
    internal_continuity_join: internal,
  };
}

function convergeTransitionOut({
  shot,
  sceneIndex,
  shotIndex,
  globalShotIndex,
  totalShots,
}) {
  const source = object(shot.transition_out);
  const internal = isInternalHandoff(shot);
  const finalShot = globalShotIndex === totalShots - 1;
  const type = firstMeaningful(
    source.type,
    source.transition_type,
    internal ? "MATCH_CUT" : finalShot ? "DIRECT_END" : "MOTIVATED_CUT",
  );
  const direction = firstMeaningful(
    source.direction,
    source.description,
    source.instruction,
  ) || (
    internal
      ? `Finish on an exact continuity handoff frame that the next production beat can inherit without reset, drift or discontinuity: ${closingState(shot)}`
      : finalShot
        ? `Complete the approved closing action and hold the factual final state through the last frame without adding an unapproved end card, logo, claim or visual flourish: ${closingState(shot)}`
        : `Cut only after the approved action, reaction, camera movement, sound cue or compositional handoff has completed: ${closingState(shot)}`
  );

  return {
    ...source,
    type,
    direction,
    motivation: firstMeaningful(
      source.motivation,
      source.reason,
      internal
        ? "Transfer the exact approved state to the next beat of the same authored sequence."
        : finalShot
          ? "Resolve the approved emotional and narrative ending cleanly."
          : `Hand the viewer to the next approved story beat after completing: ${shotPurpose(shot)}.`,
    ),
    continuity_requirements: firstMeaningful(
      source.continuity_requirements,
      source.continuity,
      "The following frame must preserve causal action, identity, screen direction, spatial geography, camera perspective, lighting, reflections, shadows, sound perspective and environmental state unless the authored transition explicitly changes them.",
    ),
    duration_frames: Number.isFinite(Number(source.duration_frames))
      ? Number(source.duration_frames)
      : 0,
    scene_number: sceneIndex + 1,
    shot_number: shotIndex + 1,
    internal_continuity_join: internal,
  };
}

function convergeSound(shot = {}) {
  const existingMusic = object(shot.music);
  const existingEffects = list(shot.sound_effects);
  const existingDialogue = list(shot.dialogue);
  const existingNarration = object(shot.narration);
  const existingContract = object(shot.sound_contract);
  const action = shotAction(shot);
  const internal = isInternalContinuation(shot) || isInternalHandoff(shot);
  const defaultEffectDirection = [
    `Use only causal, synchronized production sound supported by visible action and the approved environment: ${action}.`,
    "Preserve evidence-consistent room tone, object contact, footsteps, cloth, doors, service actions and environmental detail only where physically motivated.",
    "Silence is acceptable when no sound source is established; never invent dialogue, claims, crowd reactions, branded jingles, lyrics or off-screen events.",
  ].join(" ");

  return {
    music: {
      ...existingMusic,
      direction: firstMeaningful(
        existingMusic.direction,
        existingMusic.description,
        existingMusic.intent,
        internal
          ? "Continue the approved score or intentional silence seamlessly across this internal production join without restart, tempo jump, key change or level discontinuity."
          : "Use music only when authorized by the approved film-level sound direction; support the emotional purpose without overpowering dialogue, action detail or factual venue sound.",
      ),
      continuity: firstMeaningful(
        existingMusic.continuity,
        "Preserve tempo, key, instrumentation, ambience, loudness and edit-point continuity with adjacent approved shots unless an authored cue explicitly changes them.",
      ),
      lyrics_allowed: existingMusic.lyrics_allowed === true,
      invented_brand_claims_allowed: false,
    },
    sound_effects: existingEffects.length
      ? existingEffects
      : [defaultEffectDirection],
    dialogue: existingDialogue,
    narration: existingNarration,
    sound_contract: {
      ...existingContract,
      direction: firstMeaningful(
        existingContract.direction,
        existingContract.summary,
        defaultEffectDirection,
      ),
      sync_tolerance_ms: Number.isFinite(Number(existingContract.sync_tolerance_ms))
        ? Number(existingContract.sync_tolerance_ms)
        : 40,
      room_tone_continuity_required: true,
      perspective_continuity_required: true,
      invented_dialogue_allowed: false,
      invented_claims_allowed: false,
      source: meaningful(shot.music) || existingEffects.length || existingDialogue.length || meaningful(shot.narration)
        ? "AUTHORED_SOUND_DIRECTION"
        : "EVIDENCE_DERIVED_EXECUTION_CONTRACT",
    },
  };
}

function convergeQualityRequirements(shot = {}) {
  const source = object(shot.quality_requirements);
  const durationSeconds = Math.max(1, Number(shot.duration_seconds || 1));
  const fps = Math.max(1, Number(shot.temporal_contract?.fps || source.fps || 30));
  const expectedFrames = Math.round(durationSeconds * fps);

  return {
    ...source,
    duration: {
      ...object(source.duration),
      expected_seconds: durationSeconds,
      expected_frames: expectedFrames,
      tolerance_frames: Number.isFinite(Number(source.duration?.tolerance_frames))
        ? Number(source.duration.tolerance_frames)
        : 1,
    },
    identity_continuity: {
      ...object(source.identity_continuity),
      unapproved_identity_changes_allowed: 0,
      face_or_body_morph_events_allowed: 0,
      wardrobe_or_prop_swaps_allowed: 0,
      duplicated_or_missing_people_allowed: 0,
    },
    spatial_continuity: {
      ...object(source.spatial_continuity),
      camera_axis_breaks_allowed: 0,
      screen_direction_reversals_allowed: 0,
      geography_or_architecture_changes_allowed: 0,
      object_teleports_or_scale_changes_allowed: 0,
    },
    camera_quality: {
      ...object(source.camera_quality),
      unintended_jitter_events_allowed: 0,
      unintended_focus_hunts_allowed: 0,
      unintended_framing_resets_allowed: 0,
      intended_motion_completion_required: true,
    },
    lighting_quality: {
      ...object(source.lighting_quality),
      unmotivated_exposure_jumps_allowed: 0,
      light_direction_changes_allowed: 0,
      detached_or_contradictory_shadows_allowed: 0,
      reflection_identity_errors_allowed: 0,
    },
    human_reality: {
      ...object(source.human_reality),
      anatomy_errors_allowed: 0,
      hand_or_object_contact_failures_allowed: 0,
      repeated_or_mirrored_gesture_loops_allowed: 0,
      causal_reaction_order_required: true,
    },
    text_and_brand: {
      ...object(source.text_and_brand),
      invented_text_or_logo_instances_allowed: 0,
      misspelled_approved_text_instances_allowed: 0,
      generated_overlay_text_allowed: false,
    },
    sound_quality: {
      ...object(source.sound_quality),
      maximum_sync_offset_ms: Number.isFinite(Number(source.sound_quality?.maximum_sync_offset_ms))
        ? Number(source.sound_quality.maximum_sync_offset_ms)
        : 40,
      audible_discontinuities_allowed: 0,
      invented_dialogue_or_claims_allowed: 0,
      clipping_samples_allowed: 0,
    },
    frame_integrity: {
      ...object(source.frame_integrity),
      dropped_frames_allowed: 0,
      unintended_duplicate_frames_allowed: 0,
      black_or_corrupt_frames_allowed: 0,
      visible_generation_artifacts_allowed: 0,
    },
    transition_quality: {
      ...object(source.transition_quality),
      continuity_breaks_allowed: 0,
      unmotivated_transition_events_allowed: 0,
      exact_handoff_state_required: true,
    },
    approval: {
      ...object(source.approval),
      all_blocking_thresholds_must_pass: true,
      factual_uncertainty_is_blocking: true,
      unresolved_reference_uncertainty_is_blocking: true,
    },
  };
}

function convergeShot({
  shot,
  sceneIndex,
  shotIndex,
  globalShotIndex,
  totalShots,
}) {
  const source = clone(shot) || {};
  const actors = list(source.actors);
  const performanceDirection = authoredPerformanceDirection(source);
  const sound = convergeSound(source);

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
    transition_in: convergeTransitionIn({
      shot: source,
      sceneIndex,
      shotIndex,
      globalShotIndex,
    }),
    transition_out: convergeTransitionOut({
      shot: source,
      sceneIndex,
      shotIndex,
      globalShotIndex,
      totalShots,
    }),
    music: sound.music,
    sound_effects: sound.sound_effects,
    dialogue: sound.dialogue,
    narration: sound.narration,
    sound_contract: sound.sound_contract,
    quality_requirements: convergeQualityRequirements(source),
  };
}

export function convergeCreativePerformanceDirections({
  creativePlan,
} = {}) {
  const plan = clone(creativePlan) || {};
  const inputScenes = list(plan.scenes);
  const totalShots = inputScenes.reduce(
    (total, scene) => total + list(scene.shots).length,
    0,
  );
  let globalShotIndex = 0;
  const scenes = inputScenes.map((scene, sceneIndex) => ({
    ...scene,
    shots: list(scene.shots).map((shot, shotIndex) => {
      const converged = convergeShot({
        shot,
        sceneIndex,
        shotIndex,
        globalShotIndex,
        totalShots,
      });
      globalShotIndex += 1;
      return converged;
    }),
  }));

  return {
    ...plan,
    scenes,
    metadata: {
      ...object(plan.metadata),
      performance_direction_convergence: {
        version: "POST_SEGMENTATION_EXECUTION_CONTRACT_V2",
        applied: true,
        scene_count: scenes.length,
        shot_count: totalShots,
        applied_after_duration_segmentation: true,
        performance_direction_converged: true,
        transition_directions_converged: true,
        sound_direction_converged: true,
        measurable_quality_requirements_converged: true,
        factual_invention_allowed: false,
        validator_requirements_weakened: false,
      },
    },
  };
}
