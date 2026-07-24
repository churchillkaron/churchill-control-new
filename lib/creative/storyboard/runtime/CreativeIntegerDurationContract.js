const MIN_SHOT_SECONDS = 1;
const MAX_SHOT_SECONDS = 10;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
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

function allocateWholeSeconds(entries, targetDuration) {
  const target = Math.round(Number(targetDuration || 0));
  const shotCount = entries.length;
  const minimumTotal = shotCount * MIN_SHOT_SECONDS;
  const maximumTotal = shotCount * MAX_SHOT_SECONDS;

  if (target < minimumTotal || target > maximumTotal) {
    const error = new Error("CREATIVE_INTEGER_DURATION_CAPACITY_INVALID");
    error.code = "CREATIVE_INTEGER_DURATION_CAPACITY_INVALID";
    error.details = {
      target_duration_seconds: target,
      shot_count: shotCount,
      minimum_duration_seconds: minimumTotal,
      maximum_duration_seconds: maximumTotal,
    };
    throw error;
  }

  const desired = entries.map(({ shot }) =>
    clamp(shot.duration_seconds || 1, MIN_SHOT_SECONDS, MAX_SHOT_SECONDS),
  );
  const desiredTotal = desired.reduce((sum, value) => sum + value, 0) || shotCount;
  const scaled = desired.map((value) =>
    clamp(value * target / desiredTotal, MIN_SHOT_SECONDS, MAX_SHOT_SECONDS),
  );
  const allocated = scaled.map((value) =>
    Math.max(MIN_SHOT_SECONDS, Math.min(MAX_SHOT_SECONDS, Math.floor(value))),
  );

  let remaining = target - allocated.reduce((sum, value) => sum + value, 0);

  while (remaining > 0) {
    const candidates = scaled
      .map((value, index) => ({
        index,
        fraction: value - Math.floor(value),
        room: MAX_SHOT_SECONDS - allocated[index],
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
        removable: allocated[index] - MIN_SHOT_SECONDS,
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
    };
    throw error;
  }

  return allocated;
}

function normalizeActionBeats(shot = {}) {
  const duration = Number(shot.duration_seconds || 1);
  const beats = Array.isArray(shot.action_beats)
    ? shot.action_beats.filter(Boolean)
    : [];

  return beats.map((beat, index) => ({
    ...beat,
    at_seconds: Math.max(
      0,
      Math.min(
        Math.max(0, duration - 1),
        Number.isFinite(Number(beat.at_seconds))
          ? Number(beat.at_seconds)
          : index === 0
            ? 0
            : Math.max(0, duration - 1),
      ),
    ),
  }));
}

export function convergeCreativeIntegerDurations({
  creativePlan,
  targetDuration,
} = {}) {
  const plan = clone(creativePlan) || {};
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const entries = flattenShots(scenes);

  if (!entries.length) {
    const error = new Error("CREATIVE_STORYBOARD_SHOTS_REQUIRED");
    error.code = "CREATIVE_STORYBOARD_SHOTS_REQUIRED";
    throw error;
  }

  const target = Math.round(Number(targetDuration || 0));
  const allocated = allocateWholeSeconds(entries, target);

  entries.forEach(({ shot }, index) => {
    shot.duration_seconds = allocated[index];
    shot.action_beats = normalizeActionBeats(shot);
  });

  for (const scene of scenes) {
    scene.duration_seconds = (scene.shots || []).reduce(
      (sum, shot) => sum + Number(shot.duration_seconds || 0),
      0,
    );
  }

  const total = entries.reduce(
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

  return plan;
}
