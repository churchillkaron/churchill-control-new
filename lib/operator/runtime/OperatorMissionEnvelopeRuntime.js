const DURABLE_MISSION_MODE = "durable_registered_sequence";

function text(value, limit = 800) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function count(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : 0;
}

export function projectOperatorMissionEnvelope({
  missionRoot = false,
  result = {},
} = {}) {
  if (missionRoot !== true) return {};

  const mission = object(result);
  if (text(mission.mission_mode, 120) !== DURABLE_MISSION_MODE) return {};

  const resumePayload = object(mission.resume_payload);
  return {
    mission_mode: DURABLE_MISSION_MODE,
    status: text(mission.status, 120) || null,
    all_steps_preflighted: mission.all_steps_preflighted === true,
    total_steps: count(mission.total_steps),
    completed_steps: count(mission.completed_steps),
    remaining_steps: count(mission.remaining_steps),
    current_step_id: text(mission.current_step_id, 200) || null,
    pause_reason: text(mission.pause_reason, 120) || null,
    reason: text(mission.reason, 800) || null,
    detail: mission.detail ?? null,
    approval_request: mission.approval_request ?? null,
    steps: list(mission.steps),
    mission_state: object(mission.mission_state),
    ...(Object.keys(resumePayload).length
      ? { resume_payload: resumePayload }
      : {}),
  };
}

export const OperatorMissionEnvelopeRuntime = Object.freeze({
  contract: "AVANTIQO_OPERATOR_MISSION_UBTE_ENVELOPE_V1",
  durable_mission_mode: DURABLE_MISSION_MODE,
  authorization_effect: "NONE",
  project: projectOperatorMissionEnvelope,
});

export default OperatorMissionEnvelopeRuntime;
