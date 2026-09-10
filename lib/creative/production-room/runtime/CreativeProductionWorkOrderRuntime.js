import {
  CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS,
} from "../registry/CreativeVirtualProductionSpecialistRegistry.js";
import {
  requiredOutputsForWorkstream,
  evaluateVirtualProductionWorkstream,
} from "./CreativeVirtualProductionWorkstreamRuntime.js";

export const CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT =
  "CREATIVE_PRODUCTION_WORK_ORDER_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function byRequirement(requirement) {
  return CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAMS.find(
    (item) => Number(item.requirement) === Number(requirement),
  ) || null;
}

const BASE_DEPENDENCIES = Object.freeze({
  2: [1], 3: [1], 4: [1, 3], 5: [1, 3, 4], 6: [1, 4, 5],
  7: [4, 6], 8: [1, 3], 9: [3, 5, 8], 10: [9], 11: [10],
  12: [1], 13: [2, 3, 6], 14: [1], 15: [14], 16: [1, 3],
  17: [4, 16], 18: [1], 19: [7, 12, 18], 20: [1, 12],
});
const STAGE_DEPENDENCY_OVERRIDES = Object.freeze({
  CREATIVE_FLOOR: Object.freeze({ 16: [1], 20: [1] }),
  TECHNICAL_SCOUT: Object.freeze({ 5: [1, 3] }),
  PREVIS: Object.freeze({ 19: [7, 12] }),
  DAILIES: Object.freeze({ 20: [1, 11, 12] }),
  MASTER_DIRECTOR_REVIEW: Object.freeze({ 20: [1, 11, 12] }),
});
export function dependenciesForProductionWorkstream(stage_id, requirement) {
  const stageId = text(stage_id).toUpperCase();
  const number = Number(requirement);
  return list(STAGE_DEPENDENCY_OVERRIDES[stageId]?.[number] || BASE_DEPENDENCIES[number]);
}
export function createProductionWorkOrder({
  stage_id,
  requirement,
  completed_requirements = [],
  context_digest = null,
} = {}) {
  const stream = byRequirement(requirement);
  if (!stream) throw new Error(`PRODUCTION_WORK_ORDER_UNKNOWN_REQUIREMENT:${requirement}`);
  const dependencies = dependenciesForProductionWorkstream(stage_id, requirement);
  const completed = new Set(list(completed_requirements).map(Number));
  const blockedBy = dependencies.filter((item) => !completed.has(Number(item)));
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT,
    stage_id: text(stage_id).toUpperCase(),
    requirement: Number(requirement),
    workstream_id: stream.id,
    owner: stream.owner,
    specialists: list(stream.specialists),
    required_outputs: requiredOutputsForWorkstream(Number(requirement)),
    dependencies,
    blocked_by: blockedBy,
    status: blockedBy.length ? "BLOCKED" : "READY",
    context_digest: text(context_digest) || null,
    provider_execution_authority: false,
    media_generation_authority: false,
  });
}
export function createCurrentRoomWorkOrders({ office = {}, reports_by_stage = {} } = {}) {
  const room = office.current_room || {};
  const stageId = text(room.stage_id).toUpperCase();
  if (!stageId) return Object.freeze({
    contract: CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT,
    stage_id: null,
    work_orders: [],
    ready_count: 0,
    blocked_count: 0,
  });
  const completed = Object.values(reports_by_stage || {})
    .flatMap((reports) => list(reports))
    .filter((report) => report?.passed === true)
    .map((report) => Number(report.requirement));
  const workOrders = list(room.missing_workstreams).map((requirement) =>
    createProductionWorkOrder({
      stage_id: stageId,
      requirement,
      completed_requirements: completed,
      context_digest: office.production_entry_gate?.rehearsal_digest || null,
    }),
  );
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT,
    stage_id: stageId,
    work_orders: workOrders,
    ready_count: workOrders.filter((item) => item.status === "READY").length,
    blocked_count: workOrders.filter((item) => item.status === "BLOCKED").length,
    zero_provider_calls: true,
    zero_media_generation: true,
  });
}

export const CreativeProductionWorkOrderRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT,
  create: createProductionWorkOrder,
  createCurrentRoom: createCurrentRoomWorkOrders,
  complete: completeProductionWorkOrder,
});
export function completeProductionWorkOrder({ work_order = {}, evidence = {} } = {}) {
  if (work_order.contract !== CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT) {
    throw new Error("PRODUCTION_WORK_ORDER_CONTRACT_REQUIRED");
  }
  if (work_order.status !== "READY") {
    throw new Error(`PRODUCTION_WORK_ORDER_NOT_READY:${work_order.status || "UNKNOWN"}`);
  }
  const report = evaluateVirtualProductionWorkstream({
    requirement: work_order.requirement,
    evidence,
  });
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_WORK_ORDER_CONTRACT,
    stage_id: work_order.stage_id,
    requirement: work_order.requirement,
    workstream_report: report,
    passed: report.passed === true,
    repair_required: report.passed !== true,
    repair_route: report.passed === true ? [] : list(report.failures),
    provider_execution_authority: false,
    media_generation_authority: false,
  });
}
