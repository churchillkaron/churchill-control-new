const CONTRACT = "AVANTIQO_INTELLIGENCE_TOOL_REPLAY_GUARD_V2";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function assertNoDuplicateToolCallIdsWithinTurn(calls = [], turn = null) {
  const seen = new Set();
  for (const call of list(calls)) {
    const callId = text(call?.id);
    if (!callId) continue;
    if (seen.has(callId)) {
      throw new Error(`AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED:${callId}`);
    }
    seen.add(callId);
  }
  return {
    success: true,
    contract: CONTRACT,
    turn: Number.isInteger(Number(turn)) ? Number(turn) : null,
    unique_call_ids: seen.size,
  };
}

export const AvantiqoToolCallReplayGuardRuntime = Object.freeze({
  contract: CONTRACT,
  assertWithinTurn: assertNoDuplicateToolCallIdsWithinTurn,
});

export default AvantiqoToolCallReplayGuardRuntime;
