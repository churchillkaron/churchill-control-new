import {
  persistApprovedCreativeStillStyleMemory,
} from "./CreativeStillStyleMemoryRuntime.js";

const CONTRACT = "CREATIVE_STILL_STYLE_MEMORY_SETTLEMENT_V1";

function text(value) {
  return String(value ?? "").trim();
}

export async function settleCreativeStillStyleMemory({
  project_id,
  release_validation,
  persist = persistApprovedCreativeStillStyleMemory,
  ...input
} = {}) {
  if (release_validation?.passed !== true || !text(project_id)) {
    return Object.freeze({
      contract: CONTRACT,
      attempted: false,
      persisted: false,
      memory: null,
      error: null,
      release_blocked_by_learning_failure: false,
    });
  }

  try {
    const result = await persist({
      project_id,
      release_validation,
      ...input,
    });
    return Object.freeze({
      contract: CONTRACT,
      attempted: true,
      persisted: true,
      memory: result?.memory || null,
      error: null,
      release_blocked_by_learning_failure: false,
    });
  } catch (error) {
    return Object.freeze({
      contract: CONTRACT,
      attempted: true,
      persisted: false,
      memory: null,
      error: text(error?.message || error) || "STYLE_MEMORY_PERSISTENCE_FAILED",
      release_blocked_by_learning_failure: false,
    });
  }
}

export const CreativeStillStyleMemorySettlementRuntime = Object.freeze({
  contract: CONTRACT,
  settle: settleCreativeStillStyleMemory,
});

export default CreativeStillStyleMemorySettlementRuntime;
