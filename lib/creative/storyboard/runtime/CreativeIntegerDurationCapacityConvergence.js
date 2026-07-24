import {
  convergeCreativeIntegerDurations as convergeProviderSafeDurations,
} from "./CreativeIntegerDurationContract";

const DEFAULT_MAX_AUTHORED_SECTION_SECONDS = 15;
const DEFAULT_MIN_SECTION_SECONDS = 1;

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

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function positiveInteger(value, fallback) {
  return Math.max(1, Math.round(positiveNumber(value, fallback)));
}

function flattenShots(scenes = []) {
  return scenes.flatMap((scene, sceneIndex) =>
    list(scene.shots).map((shot, shotIndex) => ({
      sceneIndex,
      shotIndex,
      shot,
    })),
  );
}

function durationPolicy(plan = {}) {
  const specification = object(plan.production_specification);
  const minimum = positiveInteger(
    specification.min_shot_duration_seconds,
    DEFAULT_MIN_SECTION_SECONDS,
  );
  const maximum = Math.max(
    minimum,
    Math.min(
      positiveInteger(
        specification.max_shot_duration_seconds,
        DEFAULT_MAX_AUTHORED_SECTION_SECONDS,
      ),
      DEFAULT_MAX_AUTHORED_SECTION_SECONDS,
    ),
  );

  return { minimum, maximum };
}

function shotWeight(shot = {}) {
  return positiveNumber(shot.duration_seconds, 1);
}

function allocateSectionCounts(entries, requiredCount) {
  const counts = entries.map(() => 1);

  while (counts.reduce((sum, value) => sum + value, 0) < requiredCount) {
    const candidate = entries
      .map(({ shot }, index) => ({
        index,
        score: shotWeight(shot) / counts[index],
      }))
      .sort((left, right) =>
        right.score - left.score || left.index - right.index,
      )[0];

    counts[candidate.index] += 1;
  }

  return counts;
}

function normalizedActionBeats(shot = {}, expectedDuration) {
  const beats = list(shot.action_beats);
  const sourceDuration = positiveNumber(
    shot.duration_seconds,
    expectedDuration,
  );
  const scale = expectedDuration / sourceDuration;

  return beats.map((beat, index) => {
    const source = typeof beat === "object"
      ? clone(beat)
      : { action: String(beat) };
    const at = Number.isFinite(Number(source.at_seconds))
      ? Number(source.at_seconds)
      : beats.length <= 1
        ? 0
        : (index / Math.max(1, beats.length - 1)) * sourceDuration;

    return {
      ...source,
      at_seconds: Math.max(
        0,
        Math.min(
          Math.max(0, expectedDuration - 1),
          at * scale,
        ),
      ),
    };
  });
}

function sectionActionBeats({
  shot,
  sectionIndex,
  sectionCount,
  sectionStart,
  sectionEnd,
  sectionDuration,
  expectedDuration,
}) {
  const beats = normalizedActionBeats(shot, expectedDuration)
    .filter((beat) => {
      const at = Number(beat.at_seconds || 0);
      return (
        at >= sectionStart &&
        (sectionIndex === sectionCount - 1
          ? at <= sectionEnd
          : at < sectionEnd)
      );
    })
    .map((beat) => ({
      ...beat,
      at_seconds: Math.max(
        0,
        Math.min(
          Math.max(0, sectionDuration - 1),
          Number(beat.at_seconds || 0) - sectionStart,
        ),
      ),
    }));

  if (beats.length) return beats;

  return [{
    at_seconds: 0,
    action: [
      `Continue only the approved authored sequence during editorial section ${sectionIndex + 1} of ${sectionCount}.`,
      String(
        shot.performance_direction ||
        shot.purpose ||
        shot.objective ||
        shot.title ||
        "Preserve the approved story action and continuity",
      ).trim(),
    ].join(" "),
    source: "duration_capacity_convergence",
  }];
}

function sectionOpeningFrame({
  shot,
  sectionIndex,
  sectionStart,
}) {
  if (sectionIndex === 0) {
    return shot.opening_frame || shot.opening_state || "";
  }

  return [
    `Begin from the exact approved closing state of editorial section ${sectionIndex} at second ${sectionStart} of the parent authored sequence.`,
    "Preserve identity, performance, wardrobe, props, products, screen direction, camera axis, venue geometry, lighting, reflections, shadows, sound state and environmental motion without reset.",
  ].join(" ");
}

function sectionClosingFrame({
  shot,
  sectionIndex,
  sectionCount,
  sectionEnd,
}) {
  if (sectionIndex === sectionCount - 1) {
    return shot.closing_frame || shot.closing_state || shot.end_frame || "";
  }

  return [
    `Finish at the exact intermediate continuity handoff after second ${sectionEnd} of the parent authored sequence.`,
    "Hold a physically credible state ready for the next editorial section, including identity, body and object position, eye line, screen direction, camera axis, venue geography, lighting direction, reflections, shadows, sound and environmental motion.",
  ].join(" ");
}

function expandShotIntoEditorialSections({
  shot,
  sectionCount,
  expectedDuration,
}) {
  if (sectionCount <= 1) return [clone(shot)];

  const parent = clone(shot) || {};
  const base = Math.floor(expectedDuration / sectionCount);
  const remainder = expectedDuration % sectionCount;
  const durations = Array.from(
    { length: sectionCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
  const title = parent.title || parent.name || "Authored Sequence";
  let cursor = 0;

  return durations.map((duration, sectionIndex) => {
    const sectionStart = cursor;
    const sectionEnd = cursor + duration;
    cursor = sectionEnd;
    const openingFrame = sectionOpeningFrame({
      shot: parent,
      sectionIndex,
      sectionStart,
    });
    const closingFrame = sectionClosingFrame({
      shot: parent,
      sectionIndex,
      sectionCount,
      sectionEnd,
    });
    const continuity = object(parent.continuity);

    return {
      ...clone(parent),
      title: `${title} — Editorial Section ${sectionIndex + 1}/${sectionCount}`,
      purpose: [
        String(parent.purpose || parent.objective || title).trim(),
        `Execute editorial section ${sectionIndex + 1} of ${sectionCount}, covering seconds ${sectionStart}-${sectionEnd} of the approved parent sequence.`,
      ].filter(Boolean).join(" "),
      duration_seconds: duration,
      opening_frame: openingFrame,
      closing_frame: closingFrame,
      action_beats: sectionActionBeats({
        shot: parent,
        sectionIndex,
        sectionCount,
        sectionStart,
        sectionEnd,
        sectionDuration: duration,
        expectedDuration,
      }),
      continuity: {
        ...continuity,
        entering: openingFrame,
        leaving: closingFrame,
        locks: [
          ...list(continuity.locks),
          "Lock identity, wardrobe, props, products, venue geography, architecture, signage, camera axis, screen direction, lighting direction, reflections, shadows, sound state and environmental continuity across every editorial section of the parent authored sequence.",
        ],
        handoff_requirements: [
          ...list(continuity.handoff_requirements),
          sectionIndex < sectionCount - 1
            ? "The next editorial section must begin from this exact leaving state without narrative, visual, temporal, identity, camera, lighting, sound or environmental reset."
            : "This leaving state completes the approved parent authored sequence.",
        ],
      },
      transition_in:
        sectionIndex === 0
          ? clone(parent.transition_in || {})
          : {
              type: "MATCH_CUT",
              reason:
                "Internal continuity handoff within the same parent authored sequence.",
              internal_editorial_join: true,
            },
      transition_out:
        sectionIndex === sectionCount - 1
          ? clone(parent.transition_out || {})
          : {
              type: "MATCH_CUT",
              reason:
                "Preserve continuous action into the next editorial section of the same parent authored sequence.",
              internal_editorial_join: true,
            },
      authored_sequence: {
        parent_shot_number: parent.shot_number || null,
        parent_title: title,
        section_index: sectionIndex + 1,
        section_count: sectionCount,
        editorial_start_seconds: sectionStart,
        editorial_end_seconds: sectionEnd,
        editorial_duration_seconds: duration,
        reason: "TARGET_DURATION_EXCEEDS_AUTHORED_SECTION_CAPACITY",
      },
    };
  });
}

function convergeAuthoredCapacity(plan, targetDuration) {
  const scenes = list(plan.scenes);
  const entries = flattenShots(scenes);
  const policy = durationPolicy(plan);
  const target = positiveInteger(targetDuration, 30);
  const minimumRequiredSections = Math.max(
    entries.length,
    Math.ceil(target / policy.maximum),
  );

  if (minimumRequiredSections <= entries.length) {
    return {
      plan,
      report: {
        applied: false,
        original_authored_shot_count: entries.length,
        editorial_section_count: entries.length,
        maximum_editorial_section_seconds: policy.maximum,
      },
    };
  }

  const weights = entries.map(({ shot }) => shotWeight(shot));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || entries.length;
  const sectionCounts = allocateSectionCounts(
    entries,
    minimumRequiredSections,
  );
  let entryIndex = 0;

  const convergedScenes = scenes.map((scene) => ({
    ...scene,
    shots: list(scene.shots).flatMap((shot) => {
      const count = sectionCounts[entryIndex];
      const weight = weights[entryIndex];
      const expectedDuration = Math.max(
        count,
        Math.round(target * (weight / totalWeight)),
      );
      entryIndex += 1;

      return expandShotIntoEditorialSections({
        shot,
        sectionCount: count,
        expectedDuration,
      });
    }),
  }));

  return {
    plan: {
      ...plan,
      scenes: convergedScenes,
      metadata: {
        ...object(plan.metadata),
        authored_duration_capacity_convergence: {
          version: "EDITORIAL_CAPACITY_TO_PROVIDER_SEGMENTS_V1",
          applied: true,
          target_duration_seconds: target,
          original_authored_shot_count: entries.length,
          editorial_section_count: minimumRequiredSections,
          maximum_editorial_section_seconds: policy.maximum,
          final_generation_segment_seconds:
            positiveInteger(
              plan.production_specification?.max_generation_segment_seconds,
              5,
            ),
          factual_invention_allowed: false,
          parent_authored_lineage_preserved: true,
        },
      },
    },
    report: {
      applied: true,
      original_authored_shot_count: entries.length,
      editorial_section_count: minimumRequiredSections,
      maximum_editorial_section_seconds: policy.maximum,
    },
  };
}

export function convergeCreativeIntegerDurations({
  creativePlan,
  targetDuration,
} = {}) {
  const plan = clone(creativePlan) || {};
  const target = positiveInteger(targetDuration, 30);
  const capacity = convergeAuthoredCapacity(plan, target);
  const converged = convergeProviderSafeDurations({
    creativePlan: capacity.plan,
    targetDuration: target,
  });

  return {
    ...converged,
    metadata: {
      ...object(converged.metadata),
      authored_duration_capacity_convergence: {
        ...object(
          converged.metadata?.authored_duration_capacity_convergence,
        ),
        ...capacity.report,
      },
    },
  };
}
