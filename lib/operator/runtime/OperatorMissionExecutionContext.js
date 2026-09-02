import { AsyncLocalStorage } from "node:async_hooks";

export const OPERATOR_MISSION_EXECUTION_CONTEXT_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_EXECUTION_CONTEXT_V1";

const storage = new AsyncLocalStorage();

function text(value) {
  return String(value ?? "").trim();
}

export function resolveOperatorMissionExecutionId(payload = {}) {
  const topLevel = text(payload?.mission_execution_id);
  const resumed = text(payload?.resume?.mission_execution_id);
  if (topLevel && resumed && topLevel !== resumed) {
    throw new Error("OPERATOR_MISSION_EXECUTION_ID_MISMATCH");
  }
  return topLevel || resumed || crypto.randomUUID();
}

export function activeOperatorMissionExecutionId() {
  return text(storage.getStore()?.mission_execution_id) || null;
}

export async function runWithOperatorMissionExecutionId(
  missionExecutionId,
  callback,
) {
  const id = text(missionExecutionId);
  if (!id || typeof callback !== "function") {
    throw new Error("OPERATOR_MISSION_EXECUTION_CONTEXT_REQUIRED");
  }
  return storage.run(
    {
      contract: OPERATOR_MISSION_EXECUTION_CONTEXT_CONTRACT,
      mission_execution_id: id,
    },
    callback,
  );
}

export function attachOperatorMissionExecutionId(result = {}, missionExecutionId) {
  const id = text(missionExecutionId);
  if (!id || !result || typeof result !== "object" || Array.isArray(result)) {
    return result;
  }

  const output = {
    ...result,
    mission_execution_id: id,
  };

  if (result.mission_state && typeof result.mission_state === "object") {
    output.mission_state = {
      ...result.mission_state,
      mission_execution_id: id,
    };
  }

  if (result.resume_payload && typeof result.resume_payload === "object") {
    output.resume_payload = {
      ...result.resume_payload,
      mission_execution_id: id,
      resume: {
        ...(result.resume_payload.resume || {}),
        mission_execution_id: id,
      },
    };
  }

  return output;
}

export default {
  contract: OPERATOR_MISSION_EXECUTION_CONTEXT_CONTRACT,
  resolve: resolveOperatorMissionExecutionId,
  active: activeOperatorMissionExecutionId,
  run: runWithOperatorMissionExecutionId,
  attach: attachOperatorMissionExecutionId,
};