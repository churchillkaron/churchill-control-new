export const CREATIVE_PRODUCTION_ROOM_AUTOPILOT_CONTRACT =
  "CREATIVE_PRODUCTION_ROOM_AUTOPILOT_V1";

function limitSteps(value) {
  const parsed = Number(value);
  const integer = Number.isInteger(parsed) ? parsed : 12;
  return Math.max(1, Math.min(32, integer));
}

function stepSummary(step = {}, index) {
  return Object.freeze({
    index,
    action: step.action || null,
    stage_id: step.decision?.stage_id || null,
    repair_count: Number(step.wave?.repair_count || 0),
    failed_count: Number(step.wave?.failed_count || 0),
    wave_size: Number(step.wave?.wave_size || 0),
  });
}

export async function runBoundedProductionRoomAutopilot({
  step,
  max_steps = 12,
} = {}) {
  if (typeof step !== "function") throw new Error("PRODUCTION_ROOM_AUTOPILOT_STEP_RUNTIME_REQUIRED");
  const limit = limitSteps(max_steps);
  const steps = [];
  let latestGraph = null;
  for (let index = 0; index < limit; index += 1) {
    const result = await step({ index: index + 1 });
    latestGraph = result?.graph || latestGraph;
    steps.push(stepSummary(result, index + 1));

    if (result?.action === "EXECUTE_SPECIALIST_WAVE") {
      const repair = Number(result.wave?.repair_count || 0);
      const failed = Number(result.wave?.failed_count || 0);
      if (repair > 0 || failed > 0) {
        return Object.freeze({
          contract: CREATIVE_PRODUCTION_ROOM_AUTOPILOT_CONTRACT,
          status: "REPAIR_REQUIRED",
          steps,
          graph: latestGraph,
          last_step: result,
          media_generation_authority: false,
        });
      }
      if (Number(result.wave?.wave_size || 0) === 0) {
        return Object.freeze({
          contract: CREATIVE_PRODUCTION_ROOM_AUTOPILOT_CONTRACT,
          status: "BLOCKED_NO_READY_WORK",
          steps,
          graph: latestGraph,
          last_step: result,
          media_generation_authority: false,
        });
      }
      continue;
    }
    if (result?.action === "SEAL_CURRENT_ROOM") continue;
    if (result?.action === "COMPLETE") {
      return Object.freeze({
        contract: CREATIVE_PRODUCTION_ROOM_AUTOPILOT_CONTRACT,
        status: "COMPLETE",
        steps,
        graph: latestGraph,
        last_step: result,
        media_generation_authority: false,
      });
    }
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_ROOM_AUTOPILOT_CONTRACT,
      status: result?.action || "BLOCKED_UNKNOWN_STATE",
      steps,
      graph: latestGraph,
      last_step: result,
      media_generation_authority: false,
    });
  }
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_ROOM_AUTOPILOT_CONTRACT,
    status: "STEP_LIMIT_REACHED",
    steps,
    graph: latestGraph,
    media_generation_authority: false,
  });
}

export const CreativeProductionRoomAutopilotRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_ROOM_AUTOPILOT_CONTRACT,
  run: runBoundedProductionRoomAutopilot,
});
