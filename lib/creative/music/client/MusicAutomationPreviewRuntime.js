function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dbToGain(db) {
  return 10 ** (finite(db, 0) / 20);
}

function laneValueAt(lane, timeSeconds) {
  const points = lane?.points || [];
  if (!points.length) return null;
  const time = Math.max(0, finite(timeSeconds, 0));
  let previous = null;
  let next = null;
  for (const point of points) {
    if (point.time_seconds <= time) previous = point;
    if (point.time_seconds >= time) {
      next = point;
      break;
    }
  }
  if (!previous) return points[0].value;
  if (!next) return previous.value;
  if (next.time_seconds === previous.time_seconds || lane.interpolation === "step") return previous.value;
  const progress = (time - previous.time_seconds) / (next.time_seconds - previous.time_seconds);
  return previous.value + (next.value - previous.value) * Math.max(0, Math.min(1, progress));
}

function targetKey(lane) {
  return `${lane.target_type}:${lane.target_id}:${lane.parameter}`;
}

function transformedValue(parameter, value) {
  if (parameter === "gain_db") return Math.max(0.000001, dbToGain(value));
  return Math.max(-1, Math.min(1, finite(value, 0)));
}

function scheduleLane({ param, lane, startSeconds, stopAtSeconds, contextStartTime }) {
  const points = lane.points || [];
  if (!points.length || lane.enabled === false) return 0;
  const start = Math.max(0, finite(startSeconds, 0));
  const stop = Number.isFinite(stopAtSeconds) ? Math.max(start, stopAtSeconds) : Infinity;
  const startValue = laneValueAt(lane, start);
  if (startValue === null) return 0;

  param.cancelScheduledValues(contextStartTime);
  param.setValueAtTime(transformedValue(lane.parameter, startValue), contextStartTime);
  let scheduled = 1;

  for (const point of points) {
    if (point.time_seconds <= start || point.time_seconds > stop) continue;
    const when = contextStartTime + (point.time_seconds - start);
    const value = transformedValue(lane.parameter, point.value);
    if (lane.interpolation === "step") {
      param.setValueAtTime(value, when);
    } else if (lane.parameter === "gain_db") {
      param.exponentialRampToValueAtTime(value, when);
    } else {
      param.linearRampToValueAtTime(value, when);
    }
    scheduled += 1;
  }
  return scheduled;
}

export function scheduleMusicMixerAutomation({
  session,
  targets,
  startSeconds = 0,
  stopAtSeconds = null,
  contextStartTime,
} = {}) {
  let laneCount = 0;
  let eventCount = 0;
  const missingTargets = [];
  for (const lane of session?.automation_lanes || []) {
    if (lane.enabled === false || !(lane.points || []).length) continue;
    const key = targetKey(lane);
    const param = targets?.get(key);
    if (!param) {
      missingTargets.push(key);
      continue;
    }
    const count = scheduleLane({ param, lane, startSeconds, stopAtSeconds, contextStartTime });
    if (count) {
      laneCount += 1;
      eventCount += count;
    }
  }
  return {
    contract: "AVANTIQO_MUSIC_AUTOMATION_PREVIEW_V1",
    scheduled_lane_count: laneCount,
    scheduled_event_count: eventCount,
    missing_targets: missingTargets,
    sample_clock_scheduled: true,
    release_render: false,
  };
}
