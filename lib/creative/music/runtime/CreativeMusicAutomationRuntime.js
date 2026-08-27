const CONTRACT = "AVANTIQO_MUSIC_MIXER_AUTOMATION_V1";
const TARGET_TYPES = Object.freeze(["track", "group", "master"]);
const PARAMETERS = Object.freeze(["gain_db", "pan"]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampValue(parameter, value) {
  return parameter === "pan"
    ? Math.max(-1, Math.min(1, finite(value, 0)))
    : Math.max(-60, Math.min(12, finite(value, 0)));
}

export function createMusicAutomationLane(input = {}) {
  const targetType = text(input.target_type).toLowerCase();
  const targetId = text(input.target_id);
  const parameter = text(input.parameter).toLowerCase();
  if (!TARGET_TYPES.includes(targetType)) throw new Error(`CREATIVE_MUSIC_AUTOMATION_TARGET_INVALID:${targetType}`);
  if (!targetId) throw new Error("CREATIVE_MUSIC_AUTOMATION_TARGET_ID_REQUIRED");
  if (!PARAMETERS.includes(parameter)) throw new Error(`CREATIVE_MUSIC_AUTOMATION_PARAMETER_INVALID:${parameter}`);
  if (targetType === "master" && parameter === "pan") throw new Error("CREATIVE_MUSIC_MASTER_PAN_AUTOMATION_UNSUPPORTED");
  const interpolation = text(input.interpolation || "linear").toLowerCase();
  if (!["linear", "step"].includes(interpolation)) throw new Error(`CREATIVE_MUSIC_AUTOMATION_INTERPOLATION_INVALID:${interpolation}`);
  const points = (Array.isArray(input.points) ? input.points : [])
    .map((point) => ({
      time_seconds: Math.max(0, finite(point.time_seconds, 0)),
      value: clampValue(parameter, point.value),
    }))
    .sort((a, b) => a.time_seconds - b.time_seconds);
  if (points.length > 2048) throw new Error("CREATIVE_MUSIC_AUTOMATION_POINT_LIMIT:2048");
  return {
    contract: CONTRACT,
    id: text(input.id || `automation-${crypto.randomUUID()}`),
    target_type: targetType,
    target_id: targetId,
    parameter,
    interpolation,
    enabled: input.enabled !== false,
    points,
    destructive_processing_allowed: false,
  };
}

export function upsertMusicAutomationLane(session = {}, input = {}) {
  const next = structuredClone(session);
  next.automation_lanes = Array.isArray(next.automation_lanes) ? next.automation_lanes : [];
  const lane = createMusicAutomationLane(input);
  const conflict = next.automation_lanes.findIndex((entry) =>
    entry.id === lane.id || (
      entry.target_type === lane.target_type
      && entry.target_id === lane.target_id
      && entry.parameter === lane.parameter
    )
  );
  if (conflict >= 0) lane.id = next.automation_lanes[conflict].id || lane.id;
  if (conflict >= 0) next.automation_lanes[conflict] = lane;
  else next.automation_lanes.push(lane);
  return next;
}

export function removeMusicAutomationLane(session = {}, laneId) {
  const next = structuredClone(session);
  next.automation_lanes = (next.automation_lanes || []).filter((lane) => lane.id !== laneId);
  return next;
}

export function validateMusicAutomation(session = {}) {
  const trackIds = new Set((session.tracks || []).map((track) => track.id));
  const groupIds = new Set((session.buses || []).filter((bus) => bus.type === "group").map((bus) => bus.id));
  const laneIds = new Set();
  const targetParameters = new Set();
  for (const laneInput of session.automation_lanes || []) {
    const lane = createMusicAutomationLane(laneInput);
    if (laneIds.has(lane.id)) throw new Error(`CREATIVE_MUSIC_AUTOMATION_DUPLICATE_ID:${lane.id}`);
    laneIds.add(lane.id);
    const key = `${lane.target_type}:${lane.target_id}:${lane.parameter}`;
    if (targetParameters.has(key)) throw new Error(`CREATIVE_MUSIC_AUTOMATION_DUPLICATE_TARGET:${key}`);
    targetParameters.add(key);
    if (lane.target_type === "track" && !trackIds.has(lane.target_id)) throw new Error(`CREATIVE_MUSIC_AUTOMATION_TRACK_NOT_FOUND:${lane.target_id}`);
    if (lane.target_type === "group" && !groupIds.has(lane.target_id)) throw new Error(`CREATIVE_MUSIC_AUTOMATION_GROUP_NOT_FOUND:${lane.target_id}`);
    if (lane.target_type === "master" && lane.target_id !== "bus-master") throw new Error(`CREATIVE_MUSIC_AUTOMATION_MASTER_INVALID:${lane.target_id}`);
    if (lane.destructive_processing_allowed === true) throw new Error("CREATIVE_MUSIC_AUTOMATION_DESTRUCTIVE_FORBIDDEN");
  }
  return {
    success: true,
    contract: CONTRACT,
    lane_count: laneIds.size,
    point_count: (session.automation_lanes || []).reduce((sum, lane) => sum + (lane.points || []).length, 0),
    target_types: [...TARGET_TYPES],
    parameters: [...PARAMETERS],
    non_destructive: true,
  };
}

export const CreativeMusicAutomationRuntime = {
  contract: CONTRACT,
  targetTypes: TARGET_TYPES,
  parameters: PARAMETERS,
  createLane: createMusicAutomationLane,
  upsertLane: upsertMusicAutomationLane,
  removeLane: removeMusicAutomationLane,
  validate: validateMusicAutomation,
};
