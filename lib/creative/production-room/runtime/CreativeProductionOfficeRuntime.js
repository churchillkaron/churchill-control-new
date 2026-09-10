import {
  CREATIVE_PRODUCTION_ROOM_STAGES,
} from "../registry/CreativeProductionRoomStageRegistry.js";
import {
  CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS,
} from "../registry/CreativeVirtualProductionSpecialistRegistry.js";
import {
  CREATIVE_PRODUCTION_ROOM_CONTRACT,
  sealProductionRoomStage,
  productionEntryGate,
} from "./CreativeProductionRoomRuntime.js";
import {
  CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT,
} from "./CreativeVirtualProductionWorkstreamRuntime.js";

export const CREATIVE_PRODUCTION_OFFICE_CONTRACT =
  "CREATIVE_PRODUCTION_OFFICE_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function workstream(requirement) {
  return CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.find(
    (item) => Number(item.requirement) === Number(requirement),
  ) || null;
}
function validWorkstreamReports(reports = []) {
  return list(reports).filter((report) =>
    report?.contract === CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT &&
    report?.passed === true,
  );
}

function roomStatus(stage = {}, reports = []) {
  const received = new Set(
    validWorkstreamReports(reports).map((report) => Number(report.requirement)),
  );
  const required = list(stage.required_workstream_requirements).map(Number);
  const missing = required.filter((requirement) => !received.has(requirement));
  const complete = required.filter((requirement) => received.has(requirement));
  return {
    stage_id: stage.id,
    order: stage.order,
    phase: stage.phase,
    status: stage.status,
    required_workstreams: required,
    completed_workstreams: complete,
    missing_workstreams: missing,
    ready_specialist_lanes: missing.map((requirement) => ({
      requirement,
      workstream_id: workstream(requirement)?.id || null,
      owner: workstream(requirement)?.owner || null,
      specialists: list(workstream(requirement)?.specialists),
    })),
  };
}
export function evaluateProductionOffice({ plan = {}, reports_by_stage = {} } = {}) {
  if (plan.contract !== CREATIVE_PRODUCTION_ROOM_CONTRACT) {
    return Object.freeze({
      contract: CREATIVE_PRODUCTION_OFFICE_CONTRACT,
      passed: false,
      failures: ["PRODUCTION_OFFICE_ROOM_PLAN_REQUIRED"],
    });
  }
  const rooms = list(plan.stages).map((stage) =>
    roomStatus(stage, reports_by_stage[stage.id] || []),
  );
  const current = rooms.find((room) => room.status === "READY") ||
    rooms.find((room) => room.status !== "SEALED") || null;
  const sealed = rooms.filter((room) => room.status === "SEALED");
  const blockers = current
    ? current.missing_workstreams.map((requirement) =>
        `ROOM_WORKSTREAM_BLOCKED:${current.stage_id}:${requirement}`,
      )
    : [];
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_OFFICE_CONTRACT,
    passed: true,
    current_room: current,
    rooms,
    sealed_room_count: sealed.length,
    total_room_count: CREATIVE_PRODUCTION_ROOM_STAGES.length,
    blockers,
    production_entry_gate: productionEntryGate(plan),
    parallel_specialist_lane_count: current?.ready_specialist_lanes.length || 0,
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}
export function advanceProductionOffice({
  plan = {},
  stage_id,
  evidence = {},
  workstream_reports = [],
} = {}) {
  const stageId = text(stage_id).toUpperCase();
  const stage = list(plan.stages).find((item) => item.id === stageId);
  if (!stage) throw new Error(`PRODUCTION_OFFICE_STAGE_UNKNOWN:${stageId}`);
  if (stage.status !== "READY") {
    throw new Error(`PRODUCTION_OFFICE_STAGE_NOT_READY:${stageId}:${stage.status}`);
  }
  const packet = {
    ...evidence,
    workstream_reports: validWorkstreamReports(workstream_reports),
  };
  const prior = list(plan.stages)
    .filter((item) => item.order < stage.order)
    .sort((a, b) => a.order - b.order)
    .at(-1);
  const updated = sealProductionRoomStage({
    plan,
    stage_id: stageId,
    evidence: packet,
    previous_stage_digest: prior?.sealed_digest || null,
  });
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_OFFICE_CONTRACT,
    production_room_pipeline: updated,
    sealed_stage: updated.stages.find((item) => item.id === stageId),
    next_stage: updated.stages.find((item) => item.order === stage.order + 1) || null,
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeProductionOfficeRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_OFFICE_CONTRACT,
  evaluate: evaluateProductionOffice,
  advance: advanceProductionOffice,
});
