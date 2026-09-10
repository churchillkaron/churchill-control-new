import {
  evaluateProductionOffice,
  advanceProductionOffice,
} from "./CreativeProductionOfficeRuntime.js";
import {
  createCurrentRoomWorkOrders,
} from "./CreativeProductionWorkOrderRuntime.js";
import {
  assembleProductionRoomEvidence,
} from "./CreativeProductionRoomEvidenceAssemblyRuntime.js";

export const CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT =
  "CREATIVE_PRODUCTION_ROOM_AUTONOMY_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
export function decideProductionRoomAutonomy({
  production_room_pipeline = {},
  production_room_stage_inputs = {},
  reports_by_stage = {},
} = {}) {
  const office = evaluateProductionOffice({
    plan: production_room_pipeline,
    reports_by_stage,
  });
  if (office.passed !== true) {
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT,
      action: "BLOCKED_INVALID_PRODUCTION_STATE",
      office,
      zero_media_generation: true,
    });
  }
  const room = office.current_room;
  if (!room) {
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT,
      action: "COMPLETE",
      office,
      zero_media_generation: true,
    });
  }
  const workOrders = createCurrentRoomWorkOrders({
    office,
    reports_by_stage,
  });
  if (workOrders.ready_count > 0) {
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT,
      action: "EXECUTE_SPECIALIST_WAVE",
      stage_id: room.stage_id,
      office,
      work_orders: workOrders,
      zero_media_generation: true,
    });
  }
  if (list(room.missing_workstreams).length > 0) {
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT,
      action: "BLOCKED_DEPENDENCIES",
      stage_id: room.stage_id,
      blockers: list(room.missing_workstreams),
      office,
      work_orders: workOrders,
      zero_media_generation: true,
    });
  }
  const stageInput = object(production_room_stage_inputs[room.stage_id]);
  const evidenceAssembly = assembleProductionRoomEvidence({
    stage_id: room.stage_id,
    stage_input: stageInput,
    workstream_reports: reports_by_stage[room.stage_id] || [],
  });
  try {
    const preview = advanceProductionOffice({
      plan: production_room_pipeline,
      stage_id: room.stage_id,
      evidence: evidenceAssembly.evidence,
      workstream_reports: reports_by_stage[room.stage_id] || [],
    });
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT,
      action: "SEAL_CURRENT_ROOM",
      stage_id: room.stage_id,
      office,
      evidence_assembly: evidenceAssembly,
      preview,
      zero_media_generation: true,
    });
  } catch (error) {
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT,
      action: "BLOCKED_ROOM_EVIDENCE",
      stage_id: room.stage_id,
      blocker: String(error?.message || error),
      office,
      evidence_assembly: evidenceAssembly,
      zero_media_generation: true,
    });
  }
}

export const CreativeProductionRoomAutonomyRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_ROOM_AUTONOMY_CONTRACT,
  decide: decideProductionRoomAutonomy,
});
