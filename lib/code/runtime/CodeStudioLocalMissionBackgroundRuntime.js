const REGISTRY_KEY = Symbol.for("avantiqo.codeStudio.localMissionBackgroundRegistry");

function text(value, maximum = 1000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function registry() {
  const root = globalThis;
  if (!root[REGISTRY_KEY]) root[REGISTRY_KEY] = new Map();
  return root[REGISTRY_KEY];
}

function keyFor({ organization_id, mission_id }) {
  const organizationId = text(organization_id, 160);
  const missionId = text(mission_id, 240);
  if (!organizationId) throw new Error("CODE_STUDIO_BACKGROUND_ORGANIZATION_REQUIRED");
  if (!missionId) throw new Error("CODE_STUDIO_BACKGROUND_MISSION_REQUIRED");
  return `${organizationId}:${missionId}`;
}

export function codeStudioLocalMissionBackgroundStatus(input = {}) {
  const key = keyFor(input);
  const entry = registry().get(key);
  if (!entry) {
    return {
      found: false,
      running: false,
      mission_id: text(input.mission_id, 240) || null,
      started_at: null,
      finished_at: null,
      outcome: null,
    };
  }
  return {
    found: true,
    running: entry.running === true,
    mission_id: entry.mission_id,
    started_at: entry.started_at,
    finished_at: entry.finished_at || null,
    outcome: entry.outcome || null,
  };
}

export function startCodeStudioLocalMissionBackground({
  organization_id,
  mission_id,
  run,
} = {}) {
  if (typeof run !== "function") {
    throw new Error("CODE_STUDIO_BACKGROUND_RUNNER_REQUIRED");
  }
  const key = keyFor({ organization_id, mission_id });
  const current = registry().get(key);
  if (current?.running === true) {
    return {
      started: false,
      already_running: true,
      mission_id: current.mission_id,
      started_at: current.started_at,
    };
  }

  const entry = {
    mission_id: text(mission_id, 240),
    organization_id: text(organization_id, 160),
    running: true,
    started_at: new Date().toISOString(),
    finished_at: null,
    outcome: null,
    promise: null,
  };
  registry().set(key, entry);

  entry.promise = Promise.resolve()
    .then(() => run())
    .then((value) => {
      entry.outcome = {
        success: true,
        status: text(value?.status || value?.state?.status, 120) || "completed",
      };
      return value;
    })
    .catch((error) => {
      entry.outcome = {
        success: false,
        status: "failed",
        error: text(error?.message || error, 1000) || "CODE_STUDIO_BACKGROUND_FAILED",
      };
      return null;
    })
    .finally(() => {
      entry.running = false;
      entry.finished_at = new Date().toISOString();
      const finishedEntry = { ...entry, promise: null };
      registry().set(key, finishedEntry);
      const cleanupTimer = setTimeout(() => {
        const latest = registry().get(key);
        if (latest && latest.running !== true && latest.finished_at === finishedEntry.finished_at) {
          registry().delete(key);
        }
      }, 15 * 60 * 1000);
      cleanupTimer.unref?.();
    });

  return {
    started: true,
    already_running: false,
    mission_id: entry.mission_id,
    started_at: entry.started_at,
  };
}

export default Object.freeze({
  start: startCodeStudioLocalMissionBackground,
  status: codeStudioLocalMissionBackgroundStatus,
});
