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
import {
  productionEntryGate,
} from "./CreativeProductionRoomRuntime.js";

export const CREATIVE_PREPRODUCTION_CONTINUATION_CONTRACT =
  "CREATIVE_PREPRODUCTION_CONTINUATION_V1";

const PREPRODUCTION_STAGES = new Set([
  "TECHNICAL_SCOUT",
  "PREVIS",
  "DEPARTMENT_BREAKDOWN",
  "VIRTUAL_REHEARSAL",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function result(payload = {}) {
  return Object.freeze({
    contract: CREATIVE_PREPRODUCTION_CONTINUATION_CONTRACT,
    provider_calls_executed: 0,
    media_generation_executed: false,
    ...payload,
  });
}

export function continuePreproductionWithoutSpend({
  production_room_pipeline = {},
  production_room_stage_inputs = {},
  reports_by_stage = {},
  maximum_advances = 4,
} = {}) {
  let plan = production_room_pipeline;
  const advances = [];
  const limit = Math.max(1, Math.min(4, Number(maximum_advances) || 4));

  for (let attempt = 0; attempt < limit; attempt += 1) {
    const gate = productionEntryGate(plan);
    if (gate.passed) {
      return result({ action: "PRODUCTION_READY", production_room_pipeline: plan, production_entry_gate: gate, advances });
    }

    const office = evaluateProductionOffice({ plan, reports_by_stage });
    const room = office.current_room || null;
    if (!room || !PREPRODUCTION_STAGES.has(room.stage_id)) {
      return result({ action: "BLOCKED_OUTSIDE_PREPRODUCTION", production_room_pipeline: plan, production_office: office, advances });
    }

    const workOrders = createCurrentRoomWorkOrders({ office, reports_by_stage });
    if (workOrders.ready_count > 0 || list(room.missing_workstreams).length > 0) {
      return result({
        action: "SPECIALIST_EXECUTION_REQUIRED",
        stage_id: room.stage_id,
        production_room_pipeline: plan,
        production_office: office,
        production_work_orders: workOrders,
        advances,
      });
    }

    const stageInput = object(production_room_stage_inputs[room.stage_id]);
    const assembly = assembleProductionRoomEvidence({
      stage_id: room.stage_id,
      stage_input: stageInput,
      workstream_reports: reports_by_stage[room.stage_id] || [],
    });

    try {
      const advanced = advanceProductionOffice({
        plan,
        stage_id: room.stage_id,
        evidence: assembly.evidence,
        workstream_reports: reports_by_stage[room.stage_id] || [],
      });
      plan = advanced.production_room_pipeline;
      advances.push({ stage_id: room.stage_id, sealed_digest: advanced.sealed_stage?.sealed_digest || null });
    } catch (error) {
      return result({
        action: "BLOCKED_ROOM_EVIDENCE",
        stage_id: room.stage_id,
        blocker: String(error?.message || error),
        production_room_pipeline: plan,
        production_office: office,
        evidence_assembly: assembly,
        advances,
      });
    }
  }

  const gate = productionEntryGate(plan);
  return result({
    action: gate.passed ? "PRODUCTION_READY" : "ADVANCED",
    production_room_pipeline: plan,
    production_entry_gate: gate,
    advances,
  });
}

export const CreativePreproductionContinuationRuntime = Object.freeze({
  contract: CREATIVE_PREPRODUCTION_CONTINUATION_CONTRACT,
  continueWithoutSpend: continuePreproductionWithoutSpend,
});
