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

function expandShotForGeneration(shot, generationMaximum) {
  const parent = clone(shot) || {};
  const totalDuration = positiveInteger(parent.duration_seconds, 1);
  const durations = balancedSegmentDurations(
    totalDuration,
    generationMaximum,
  );

  if (durations.length === 1) {
    return [
      {
        ...parent,
        duration_seconds: durations[0],
        action_beats: normalizeActionBeats(parent),
        production_segment: {
          parent_authored_shot_number: parent.shot_number || null,
          segment_index: 1,
          segment_count: 1,
          editorial_start_seconds: 0,
          editorial_end_seconds: durations[0],
          editorial_duration_seconds: durations[0],
          maximum_provider_generation_seconds: generationMaximum,
        },
      },
    ];
  }

  let cursor = 0;
  return durations.map((durationSeconds, segmentIndex) => {
    const startSeconds = cursor;
    const endSeconds = cursor + durationSeconds;
    cursor = endSeconds;
    const openingFrame = segmentOpeningFrame({
      shot: parent,
      segmentIndex,
      startSeconds,
    });
    const closingFrame = segmentClosingFrame({
      shot: parent,
      segmentIndex,
      segmentCount: durations.length,
      endSeconds,
    });
    const parentTitle = parent.title || parent.name || "Authored Shot";

    return {
      ...clone(parent),
      title: `${parentTitle} — Production Beat ${segmentIndex + 1}/${durations.length}`,
      purpose: [
        String(parent.purpose || parent.objective || parentTitle).trim(),
        `Execute only production beat ${segmentIndex + 1} of ${durations.length} covering editorial seconds ${startSeconds}-${endSeconds}.`,
      ].filter(Boolean).join(" "),
      duration_seconds: durationSeconds,
      opening_frame: openingFrame,
      closing_frame: closingFrame,
      action_beats: segmentActionBeats({
        shot: parent,
        segmentIndex,
        segmentCount: durations.length,
        startSeconds,
        endSeconds,
        durationSeconds,
      }),
      continuity: segmentContinuity({
        shot: parent,
        segmentIndex,
        segmentCount: durations.length,
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
        segmentIndex === durations.length - 1
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
        segmentCount: durations.length,
        startSeconds,
        endSeconds,
        durationSeconds,
      }),
      production_segment: {
        parent_authored_shot_number: parent.shot_number || null,
        parent_authored_shot_title: parentTitle,
        segment_index: segmentIndex + 1,
        segment_count: durations.length,
        editorial_start_seconds: startSeconds,
        editorial_end_seconds: endSeconds,
        editorial_duration_seconds: durationSeconds,
        maximum_provider_generation_seconds: generationMaximum,
      },
    };
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
      version: "provider-safe-production-segmentation-v3",
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
    },
  };

  return plan;
}
