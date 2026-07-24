const DEFAULT_MIN_SHOT_SECONDS = 1;
const DEFAULT_MAX_AUTHORED_SHOT_SECONDS = 15;
const VALIDATOR_MAX_SHOT_SECONDS = 15;
const DEFAULT_MAX_GENERATION_SECONDS = 5;

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

function compactEvidence(value, fallback) {
  const source = typeof value === "string"
    ? value
    : JSON.stringify(value || "");
  const normalized = String(source || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return fallback;
  return normalized.length > 420
    ? `${normalized.slice(0, 417)}...`
    : normalized;
}

function positiveInteger(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value || 0)));
}

function flattenShots(scenes = []) {
  return scenes.flatMap((scene, sceneIndex) =>
    (Array.isArray(scene.shots) ? scene.shots : []).map((shot, shotIndex) => ({
      sceneIndex,
      shotIndex,
      shot,
    })),
  );
}

function durationBounds(plan = {}) {
  const specification = plan.production_specification || {};
  const minimum = positiveInteger(
    specification.min_shot_duration_seconds,
    DEFAULT_MIN_SHOT_SECONDS,
  );
  const requestedMaximum = positiveInteger(
    specification.max_shot_duration_seconds,
    DEFAULT_MAX_AUTHORED_SHOT_SECONDS,
  );
  const authoredMaximum = Math.max(
    minimum,
    Math.min(requestedMaximum, VALIDATOR_MAX_SHOT_SECONDS),
  );
  const generationMaximum = Math.max(
    minimum,
    Math.min(
      positiveInteger(
        specification.max_generation_segment_seconds,
        DEFAULT_MAX_GENERATION_SECONDS,
      ),
      DEFAULT_MAX_GENERATION_SECONDS,
      authoredMaximum,
    ),
  );

  return {
    minimum,
    authoredMaximum,
    generationMaximum,
    source: specification.max_shot_duration_seconds
      ? "production_specification"
      : "canonical_default",
    generationSource: specification.max_generation_segment_seconds
      ? "production_specification"
      : "provider_safe_default",
  };
}

function allocateWholeSeconds(entries, targetDuration, bounds) {
  const target = Math.round(Number(targetDuration || 0));
  const shotCount = entries.length;
  const minimumTotal = shotCount * bounds.minimum;
  const maximumTotal = shotCount * bounds.authoredMaximum;

  if (target < minimumTotal || target > maximumTotal) {
    const error = new Error("CREATIVE_INTEGER_DURATION_CAPACITY_INVALID");
    error.code = "CREATIVE_INTEGER_DURATION_CAPACITY_INVALID";
    error.details = {
      target_duration_seconds: target,
      authored_shot_count: shotCount,
      minimum_shot_duration_seconds: bounds.minimum,
      maximum_authored_shot_duration_seconds: bounds.authoredMaximum,
      minimum_duration_seconds: minimumTotal,
      maximum_duration_seconds: maximumTotal,
      duration_bound_source: bounds.source,
    };
    throw error;
  }

  const desired = entries.map(({ shot }) =>
    clamp(
      shot.duration_seconds || bounds.minimum,
      bounds.minimum,
      bounds.authoredMaximum,
    ),
  );
  const desiredTotal =
    desired.reduce((sum, value) => sum + value, 0) || shotCount;
  const scaled = desired.map((value) =>
    clamp(
      value * target / desiredTotal,
      bounds.minimum,
      bounds.authoredMaximum,
    ),
  );
  const allocated = scaled.map((value) =>
    Math.max(
      bounds.minimum,
      Math.min(bounds.authoredMaximum, Math.floor(value)),
    ),
  );

  let remaining =
    target - allocated.reduce((sum, value) => sum + value, 0);

  while (remaining > 0) {
    const candidates = scaled
      .map((value, index) => ({
        index,
        fraction: value - Math.floor(value),
        room: bounds.authoredMaximum - allocated[index],
      }))
      .filter((candidate) => candidate.room > 0)
      .sort((left, right) =>
        right.fraction - left.fraction ||
        right.room - left.room ||
        left.index - right.index,
      );

    if (!candidates.length) break;

    for (const candidate of candidates) {
      if (remaining <= 0) break;
      allocated[candidate.index] += 1;
      remaining -= 1;
    }
  }

  while (remaining < 0) {
    const candidates = scaled
      .map((value, index) => ({
        index,
        fraction: value - Math.floor(value),
        removable: allocated[index] - bounds.minimum,
      }))
      .filter((candidate) => candidate.removable > 0)
      .sort((left, right) =>
        left.fraction - right.fraction ||
        right.removable - left.removable ||
        right.index - left.index,
      );

    if (!candidates.length) break;

    for (const candidate of candidates) {
      if (remaining >= 0) break;
      allocated[candidate.index] -= 1;
      remaining += 1;
    }
  }

  if (remaining !== 0) {
    const error = new Error("CREATIVE_INTEGER_DURATION_ALLOCATION_FAILED");
    error.code = "CREATIVE_INTEGER_DURATION_ALLOCATION_FAILED";
    error.details = {
      target_duration_seconds: target,
      allocated_duration_seconds:
        allocated.reduce((sum, value) => sum + value, 0),
      unresolved_seconds: remaining,
      minimum_shot_duration_seconds: bounds.minimum,
      maximum_authored_shot_duration_seconds: bounds.authoredMaximum,
    };
    throw error;
  }

  return allocated;
}

function normalizeActionBeats(shot = {}) {
  const duration = Number(shot.duration_seconds || 1);
  const beats = list(shot.action_beats);

  return beats.map((beat, index) => {
    const source = typeof beat === "object"
      ? beat
      : { action: String(beat) };

    return {
      ...source,
      at_seconds: Math.max(
        0,
        Math.min(
          Math.max(0, duration - 1),
          Number.isFinite(Number(source.at_seconds))
            ? Number(source.at_seconds)
            : index === 0
              ? 0
              : Math.max(0, duration - 1),
        ),
      ),
    };
  });
}

function productionPurpose(shot = {}) {
  return compactEvidence(
    firstMeaningful(
      shot.purpose,
      shot.objective,
      shot.title,
      shot.performance_direction,
    ),
    "the approved authored shot purpose",
  );
}

function productionAction(shot = {}) {
  return compactEvidence(
    firstMeaningful(
      shot.action_beats,
      shot.performance_direction,
      shot.action,
      shot.description,
    ),
    "the approved authored shot action",
  );
}

function convergeProductionCamera({
  shot,
  openingFrame,
  closingFrame,
  segmentIndex,
  segmentCount,
  startSeconds,
  endSeconds,
}) {
  const source = {
    ...object(shot.cinematography),
    ...object(shot.camera_contract),
    ...object(shot.camera),
  };
  const purpose = productionPurpose(shot);
  const action = productionAction(shot);
  const split = segmentCount > 1;
  const firstSegment = segmentIndex === 0;
  const finalSegment = segmentIndex === segmentCount - 1;
  const authoredStart = firstMeaningful(
    source.start_position,
    source.start,
    source.position_start,
    source.origin,
  );
  const authoredEnd = firstMeaningful(
    source.end_position,
    source.end,
    source.position_end,
    source.destination,
  );
  const movement = firstMeaningful(
    source.movement,
    source.movement_type,
    source.camera_movement,
    source.move,
  ) ||
    `Execute only camera movement implied by the authored action (${action}) and the opening-to-closing frame change. When no movement is explicitly required, remain locked without drift.`;
  const startPosition = split && !firstSegment
    ? `Begin from the exact camera position, height, angle, axis, lens perspective and framing delivered by production beat ${segmentIndex} at editorial second ${startSeconds}: ${openingFrame}`
    : authoredStart ||
      `Begin in the exact camera-to-subject and camera-to-environment spatial relationship established by the opening frame: ${openingFrame}`;
  const endPosition = split && !finalSegment
    ? `Reach the exact intermediate camera handoff required at editorial second ${endSeconds}, preserving axis, perspective and screen direction for production beat ${segmentIndex + 2}: ${closingFrame}`
    : authoredEnd ||
      `Finish in the exact camera-to-subject and camera-to-environment spatial relationship established by the closing frame: ${closingFrame}`;
  const movementSpeed = firstMeaningful(
    source.movement_speed,
    source.speed,
    source.camera_speed,
  ) ||
    `Use the slowest physically credible speed that completes only this ${Math.max(1, endSeconds - startSeconds)}-second production beat without rushing, acceleration jumps or unmotivated easing.`;
  const focusStrategy = firstMeaningful(
    source.focus_strategy,
    source.focus,
    source.focus_plan,
    source.depth_of_field,
  ) ||
    `Keep the story-critical subject defined by the purpose (${purpose}) in motivated focus; rack focus only when the authored action transfers attention and never pulse, hunt or breathe artificially.`;
  const composition = firstMeaningful(
    source.composition,
    source.framing,
    source.frame,
  ) ||
    `Preserve the authored framing hierarchy, subject scale, headroom, lead room, negative space, architecture and product placement established between opening frame (${openingFrame}) and closing frame (${closingFrame}).`;
  const motivation = firstMeaningful(
    source.motivation,
    source.camera_motivation,
    source.reason,
  ) ||
    `Every camera choice must reveal, follow or emotionally clarify the approved purpose (${purpose}) and action (${action}); no decorative movement, random reframing or provider-invented coverage.`;
  const lens = firstMeaningful(
    source.lens,
    source.focal_length,
    source.lens_choice,
  ) ||
    "Use the focal perspective already implied by the authored frame geometry; preserve facial proportions, architecture, product geometry and spatial depth without unmotivated focal-length change.";
  const angle = firstMeaningful(
    source.angle,
    source.camera_angle,
  ) ||
    "Maintain the authored viewpoint and power relationship implied by the opening frame; change angle only as required by the approved camera path.";
  const height = firstMeaningful(
    source.height,
    source.camera_height,
  ) ||
    "Maintain the camera height implied by the authored eye line, subject geometry and environment; no unexplained vertical drift.";
  const support = firstMeaningful(
    source.support,
    source.rig,
    source.stabilization,
  ) ||
    "Use locked, tripod, dolly, gimbal or handheld behavior only as required by the authored movement, while preserving intentional stability and eliminating synthetic float or jitter.";
  const screenDirection = firstMeaningful(
    source.screen_direction,
    source.axis,
    source.line_of_action,
  ) ||
    "Preserve the established line of action, actor travel direction, look direction and camera axis throughout this beat and its continuity handoff.";
  const exposureIntent = firstMeaningful(
    source.exposure_intent,
    source.exposure,
  ) ||
    "Protect story-critical faces, products, signage and highlights while preserving the authored lighting hierarchy and natural roll-off; exposure changes must be motivated by actual camera or subject movement.";

  return {
    ...source,
    start_position: startPosition,
    end_position: endPosition,
    movement,
    movement_type: firstMeaningful(source.movement_type, movement),
    movement_speed: movementSpeed,
    lens,
    focal_length: firstMeaningful(source.focal_length, lens),
    angle,
    height,
    support,
    focus_strategy: focusStrategy,
    composition,
    screen_direction: screenDirection,
    exposure_intent: exposureIntent,
    motivation,
    production_segment_scope: {
      segment_index: segmentIndex + 1,
      segment_count: segmentCount,
      editorial_start_seconds: startSeconds,
      editorial_end_seconds: endSeconds,
      full_parent_move_repetition_forbidden: split,
    },
  };
}

function convergeProductionLighting({
  shot,
  openingFrame,
  closingFrame,
  segmentIndex,
  segmentCount,
  startSeconds,
  endSeconds,
}) {
  const source = {
    ...object(shot.production_design?.lighting),
    ...object(shot.lighting_contract),
    ...object(shot.lighting),
  };
  const purpose = productionPurpose(shot);
  const action = productionAction(shot);
  const sourcePositions = firstMeaningful(
    source.source_positions,
    source.sources,
    source.light_sources,
  ) ||
    `Preserve all motivated practical, ambient and shaped source positions implied by the authored environment and opening frame (${openingFrame}); do not invent or relocate visible light sources.`;
  const keyLight = firstMeaningful(
    source.key_light,
    source.key,
  ) ||
    "Use the strongest motivated source already implied by the scene as key, with stable direction, softness, falloff and shadow logic across the complete production beat.";
  const fillLight = firstMeaningful(
    source.fill_light,
    source.fill,
  ) ||
    "Use only environment-motivated fill needed to preserve readable shadow detail without flattening the authored contrast or changing the apparent source direction.";
  const edgeLight = firstMeaningful(
    source.edge_light,
    source.rim_light,
    source.back_light,
  ) ||
    "Use edge or back separation only when physically motivated by an established source; never add an artificial glamour rim that contradicts the environment.";
  const practicals = firstMeaningful(
    source.practicals,
    source.practical_lights,
  ) ||
    "Preserve all visible practical fixtures, signs, windows and environmental sources in their established positions, colors and intensity relationships without flicker or duplication.";
  const temperature = firstMeaningful(
    source.temperature,
    source.color_temperature,
    source.white_balance,
  ) ||
    "Maintain the authored warm/cool relationship and factual color appearance established by the environment, skin, wardrobe, products and brand references; no unmotivated white-balance shift.";
  const exposureHierarchy = firstMeaningful(
    source.exposure_hierarchy,
    source.exposure_priority,
    source.exposure,
  ) ||
    `Prioritize the story-critical subject required by the purpose (${purpose}), then preserve readable products, signage and environmental context while protecting practical highlights and maintaining natural shadow detail.`;
  const contrast = firstMeaningful(
    source.contrast,
    source.contrast_ratio,
    source.tonal_contrast,
  ) ||
    "Maintain the authored contrast relationship from opening to closing frame with controlled highlight roll-off, stable blacks and readable faces/products; do not flatten, crush or relight between frames.";
  const motivation = firstMeaningful(
    source.motivation,
    source.lighting_motivation,
    source.reason,
  ) ||
    `Every illumination, exposure and color decision must remain motivated by established physical sources and support the approved purpose (${purpose}) and action (${action}); no provider-invented beauty lighting.`;
  const atmosphere = firstMeaningful(
    source.atmosphere,
    source.volumetrics,
  ) ||
    "Preserve only atmosphere already established by the authored environment; haze, smoke, weather, bloom and volumetrics must remain physically sourced and temporally stable.";
  const reflections = firstMeaningful(
    source.reflections,
    source.reflection_rules,
  ) ||
    "Keep reflections causally aligned with source positions, camera movement, actor movement, products, glass, metal and architecture; no duplicated or drifting reflected subjects.";
  const shadows = firstMeaningful(
    source.shadows,
    source.shadow_rules,
  ) ||
    "Maintain stable shadow direction, contact, density and softness consistent with the established sources, geometry and movement; no detached, changing or contradictory shadows.";
  const skinTreatment = firstMeaningful(
    source.skin_treatment,
    source.skin,
  ) ||
    "Render skin with natural exposure, texture and color continuity while preserving identity, age and environment-driven illumination; no plastic smoothing, face relighting or complexion drift.";
  const productTreatment = firstMeaningful(
    source.product_treatment,
    source.products,
  ) ||
    "Preserve factual product, food, drink, material, logo and brand colors with physically plausible highlights, reflections, translucency and texture; no beautification that changes the item.";
  const environmentalStability = firstMeaningful(
    source.environmental_stability,
    source.continuity,
    source.stability,
  ) ||
    `Lock source direction, exposure hierarchy, contrast, temperature, practical intensity, atmosphere, reflections and shadows from editorial second ${startSeconds} to ${endSeconds}, and hand them unchanged to the adjacent production beat unless the authored action explicitly motivates a change.`;

  return {
    ...source,
    source_positions: sourcePositions,
    sources: firstMeaningful(source.sources, sourcePositions),
    key_light: keyLight,
    fill_light: fillLight,
    edge_light: edgeLight,
    practicals,
    temperature,
    color_temperature: firstMeaningful(source.color_temperature, temperature),
    exposure_hierarchy: exposureHierarchy,
    contrast,
    motivation,
    atmosphere,
    reflections,
    shadows,
    skin_treatment: skinTreatment,
    product_treatment: productTreatment,
    environmental_stability: environmentalStability,
    opening_state: firstMeaningful(
      source.opening_state,
      `Lighting begins in the exact motivated state visible in the opening frame: ${openingFrame}`,
    ),
    closing_state: firstMeaningful(
      source.closing_state,
      `Lighting finishes in the exact motivated state visible in the closing frame: ${closingFrame}`,
    ),
    production_segment_scope: {
      segment_index: segmentIndex + 1,
      segment_count: segmentCount,
      editorial_start_seconds: startSeconds,
      editorial_end_seconds: endSeconds,
      lighting_reset_forbidden: segmentCount > 1,
    },
  };
}

function balancedSegmentDurations(totalDuration, maximum) {
  const total = positiveInteger(totalDuration, 1);
  const segmentCount = Math.max(1, Math.ceil(total / maximum));
  const base = Math.floor(total / segmentCount);
  const remainder = total % segmentCount;

  return Array.from(
    { length: segmentCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function segmentActionBeats({
  shot,
  segmentIndex,
  segmentCount,
  startSeconds,
  endSeconds,
  durationSeconds,
}) {
  const original = normalizeActionBeats(shot);
  const selected = original
    .filter((beat) => {
      const at = Number(beat.at_seconds || 0);
      return (
        at >= startSeconds &&
        (segmentIndex === segmentCount - 1
          ? at <= endSeconds
          : at < endSeconds)
      );
    })
    .map((beat) => ({
      ...beat,
      at_seconds: Math.max(
        0,
        Math.min(
          Math.max(0, durationSeconds - 1),
          Number(beat.at_seconds || 0) - startSeconds,
        ),
      ),
    }));

  if (selected.length) return selected;

  return [
    {
      at_seconds: 0,
      action:
        `Continue only the authored action and performance direction for production beat ${segmentIndex + 1} of ${segmentCount}: ${String(
          shot.performance_direction ||
          shot.purpose ||
          shot.title ||
          "the approved shot action",
        ).trim()}`,
      source: "authored_shot_production_segmentation",
    },
  ];
}

function segmentOpeningFrame({
  shot,
  segmentIndex,
  startSeconds,
}) {
  if (segmentIndex === 0) {
    return shot.opening_frame || shot.opening_state || "";
  }

  return [
    `Continue from the exact approved closing state of the preceding production beat at ${startSeconds} seconds within the authored shot "${shot.title || "Untitled Shot"}".`,
    "Preserve identity, face, body proportions, wardrobe, handedness, actor and object position, product state, screen direction, camera axis, venue geometry, signage, text, lighting direction, reflections, shadows and environmental motion without reset or drift.",
  ].join(" ");
}

function segmentClosingFrame({
  shot,
  segmentIndex,
  segmentCount,
  endSeconds,
}) {
  if (segmentIndex === segmentCount - 1) {
    return shot.closing_frame || shot.closing_state || shot.end_frame || "";
  }

  return [
    `End at the exact intermediate continuity handoff after ${endSeconds} seconds of the authored shot "${shot.title || "Untitled Shot"}".`,
    "Hold a physically credible final frame with every identity, pose, wardrobe detail, prop, product state, eye line, screen direction, camera axis, venue feature, light direction and environmental condition ready for the next production beat.",
  ].join(" ");
}

function segmentContinuity({
  shot,
  segmentIndex,
  segmentCount,
  openingFrame,
  closingFrame,
}) {
  const source = object(shot.continuity);
  const locks = [
    ...list(source.locks),
    "Lock the parent authored shot's identity, wardrobe, props, product state, venue geography, architecture, signage, camera axis, screen direction, light direction, reflections, shadows and environmental state across every production beat.",
  ];

  return {
    ...source,
    entering: openingFrame,
    leaving: closingFrame,
    locks: [...new Set(locks.map(String).filter(Boolean))],
    handoff_requirements: [
      ...list(source.handoff_requirements),
      segmentIndex < segmentCount - 1
        ? "The next production beat must begin from this exact leaving state without visual, temporal, identity, geometry, lighting or performance reset."
        : "This leaving state is the approved closing state of the complete authored shot.",
    ],
  };
}

function segmentPostProduction({
  shot,
  segmentIndex,
  segmentCount,
  startSeconds,
  endSeconds,
  durationSeconds,
}) {
  const source = object(shot.post_production);

  return {
    ...source,
    production_segment: {
      parent_authored_shot_number: shot.shot_number || null,
      segment_index: segmentIndex + 1,
      segment_count: segmentCount,
      editorial_start_seconds: startSeconds,
      editorial_end_seconds: endSeconds,
      editorial_duration_seconds: durationSeconds,
      maximum_provider_generation_seconds: DEFAULT_MAX_GENERATION_SECONDS,
      internal_join:
        segmentIndex < segmentCount - 1
          ? "SEAMLESS_CONTINUITY_HANDOFF"
          : "AUTHORED_SHOT_COMPLETE",
    },
  };
}

function buildProductionBeat({
  parent,
  durationSeconds,
  segmentIndex,
  segmentCount,
  startSeconds,
  endSeconds,
}) {
  const openingFrame = segmentOpeningFrame({
    shot: parent,
    segmentIndex,
    startSeconds,
  });
  const closingFrame = segmentClosingFrame({
    shot: parent,
    segmentIndex,
    segmentCount,
    endSeconds,
  });
  const parentTitle = parent.title || parent.name || "Authored Shot";
  const split = segmentCount > 1;

  return {
    ...clone(parent),
    title: split
      ? `${parentTitle} — Production Beat ${segmentIndex + 1}/${segmentCount}`
      : parentTitle,
    purpose: [
      String(parent.purpose || parent.objective || parentTitle).trim(),
      split
        ? `Execute only production beat ${segmentIndex + 1} of ${segmentCount} covering editorial seconds ${startSeconds}-${endSeconds}.`
        : null,
    ].filter(Boolean).join(" "),
    duration_seconds: durationSeconds,
    opening_frame: openingFrame,
    closing_frame: closingFrame,
    action_beats: segmentActionBeats({
      shot: parent,
      segmentIndex,
      segmentCount,
      startSeconds,
      endSeconds,
      durationSeconds,
    }),
    camera: convergeProductionCamera({
      shot: parent,
      openingFrame,
      closingFrame,
      segmentIndex,
      segmentCount,
      startSeconds,
      endSeconds,
    }),
    lighting: convergeProductionLighting({
      shot: parent,
      openingFrame,
      closingFrame,
      segmentIndex,
      segmentCount,
      startSeconds,
      endSeconds,
    }),
    continuity: segmentContinuity({
      shot: parent,
      segmentIndex,
      segmentCount,
      openingFrame,
      closingFrame,
    }),
    transition_in:
      segmentIndex === 0
        ? clone(parent.transition_in || {})
        : {
            type: "MATCH_CUT",
            reason:
              "Seamless continuation from the preceding production beat of the same authored shot.",
            internal_production_join: true,
          },
    transition_out:
      segmentIndex === segmentCount - 1
        ? clone(parent.transition_out || {})
        : {
            type: "MATCH_CUT",
            reason:
              "Preserve action, identity, camera, lighting and environmental continuity into the next production beat.",
            internal_production_join: true,
          },
    post_production: segmentPostProduction({
      shot: parent,
      segmentIndex,
      segmentCount,
      startSeconds,
      endSeconds,
      durationSeconds,
    }),
    production_segment: {
      parent_authored_shot_number: parent.shot_number || null,
      parent_authored_shot_title: parentTitle,
      segment_index: segmentIndex + 1,
      segment_count: segmentCount,
      editorial_start_seconds: startSeconds,
      editorial_end_seconds: endSeconds,
      editorial_duration_seconds: durationSeconds,
      maximum_provider_generation_seconds: DEFAULT_MAX_GENERATION_SECONDS,
      camera_contract_converged: true,
      lighting_contract_converged: true,
    },
  };
}

function expandShotForGeneration(shot, generationMaximum) {
  const parent = clone(shot) || {};
  const totalDuration = positiveInteger(parent.duration_seconds, 1);
  const durations = balancedSegmentDurations(
    totalDuration,
    generationMaximum,
  );
  let cursor = 0;

  return durations.map((durationSeconds, segmentIndex) => {
    const startSeconds = cursor;
    const endSeconds = cursor + durationSeconds;
    cursor = endSeconds;

    return buildProductionBeat({
      parent,
      durationSeconds,
      segmentIndex,
      segmentCount: durations.length,
      startSeconds,
      endSeconds,
    });
  });
}

function expandScenesForGeneration(scenes, generationMaximum) {
  let productionShotNumber = 0;

  for (const scene of scenes) {
    const expanded = list(scene.shots).flatMap((shot) =>
      expandShotForGeneration(shot, generationMaximum),
    );

    scene.shots = expanded.map((shot) => ({
      ...shot,
      shot_number: ++productionShotNumber,
    }));
    scene.duration_seconds = scene.shots.reduce(
      (sum, shot) => sum + Number(shot.duration_seconds || 0),
      0,
    );
  }
}

export function convergeCreativeIntegerDurations({
  creativePlan,
  targetDuration,
} = {}) {
  const plan = clone(creativePlan) || {};
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const authoredEntries = flattenShots(scenes);

  if (!authoredEntries.length) {
    const error = new Error("CREATIVE_STORYBOARD_SHOTS_REQUIRED");
    error.code = "CREATIVE_STORYBOARD_SHOTS_REQUIRED";
    throw error;
  }

  const target = Math.round(Number(targetDuration || 0));
  const bounds = durationBounds(plan);
  const allocated = allocateWholeSeconds(
    authoredEntries,
    target,
    bounds,
  );

  authoredEntries.forEach(({ shot }, index) => {
    shot.duration_seconds = allocated[index];
    shot.action_beats = normalizeActionBeats(shot);
  });

  const authoredShotCount = authoredEntries.length;
  expandScenesForGeneration(
    scenes,
    bounds.generationMaximum,
  );
  const productionEntries = flattenShots(scenes);
  const total = productionEntries.reduce(
    (sum, { shot }) => sum + Number(shot.duration_seconds || 0),
    0,
  );

  if (total !== target) {
    const error = new Error("CREATIVE_INTEGER_DURATION_TOTAL_MISMATCH");
    error.code = "CREATIVE_INTEGER_DURATION_TOTAL_MISMATCH";
    error.details = {
      target_duration_seconds: target,
      planned_duration_seconds: total,
    };
    throw error;
  }

  const overLimit = productionEntries.filter(
    ({ shot }) =>
      Number(shot.duration_seconds || 0) > bounds.generationMaximum,
  );
  if (overLimit.length) {
    const error = new Error("CREATIVE_GENERATION_SEGMENT_DURATION_INVALID");
    error.code = "CREATIVE_GENERATION_SEGMENT_DURATION_INVALID";
    error.details = {
      maximum_generation_segment_seconds: bounds.generationMaximum,
      invalid_segments: overLimit.map(({ shot }) => ({
        shot_number: shot.shot_number,
        duration_seconds: shot.duration_seconds,
      })),
    };
    throw error;
  }

  plan.metadata = {
    ...(plan.metadata || {}),
    integer_duration_contract: {
      version: "provider-safe-production-segmentation-v4",
      target_duration_seconds: target,
      authored_shot_count: authoredShotCount,
      production_shot_count: productionEntries.length,
      generated_segment_count: productionEntries.length,
      minimum_shot_duration_seconds: bounds.minimum,
      maximum_authored_shot_duration_seconds: bounds.authoredMaximum,
      maximum_generation_segment_seconds: bounds.generationMaximum,
      duration_bound_source: bounds.source,
      generation_bound_source: bounds.generationSource,
      authored_structure_preserved_through_parent_lineage: true,
      provider_safe_generation_units: true,
      camera_contracts_converged: true,
      lighting_contracts_converged: true,
    },
  };

  return plan;
}
