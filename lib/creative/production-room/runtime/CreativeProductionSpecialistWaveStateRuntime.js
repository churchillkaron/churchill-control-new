import {
  evaluateProductionOffice,
} from "./CreativeProductionOfficeRuntime.js";
import {
  createCurrentRoomWorkOrders,
} from "./CreativeProductionWorkOrderRuntime.js";
import {
  CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_CONTRACT,
} from "./CreativeProductionSpecialistSchedulerRuntime.js";
import {
  CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT,
} from "./CreativeVirtualProductionWorkstreamRuntime.js";

export const CREATIVE_PRODUCTION_SPECIALIST_WAVE_STATE_CONTRACT =
  "CREATIVE_PRODUCTION_SPECIALIST_WAVE_STATE_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
function text(value) {
  return String(value ?? "").trim();
}
function validReport(item = {}) {
  const report = item?.result?.completion?.workstream_report ||
    item?.result?.workstream_report || null;
  return report?.contract === CREATIVE_VIRTUAL_PRODUCTION_WORKSTREAM_CONTRACT
    ? report
    : null;
}

function auditRow(item = {}) {
  return Object.freeze({
    work_order_id: text(item?.work_order?.id) || null,
    stage_id: text(item?.work_order?.stage_id).toUpperCase() || null,
    requirement: Number(item?.work_order?.requirement || 0) || null,
    status: item?.status || null,
    passed: item?.result?.passed === true,
    repair_required: item?.result?.completion?.repair_required === true,
    repair_route: list(item?.result?.completion?.repair_route),
    error: text(item?.error) || null,
    provider: text(item?.result?.provider) || null,
    model: text(item?.result?.model) || null,
  });
}
export function mergeSpecialistWaveState({
  production_room_pipeline = {},
  reports_by_stage = {},
  prior_audit = [],
  wave_result = {},
} = {}) {
  if (wave_result.contract !== CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_CONTRACT) {
    throw new Error("PRODUCTION_SPECIALIST_SCHEDULER_RESULT_REQUIRED");
  }
  const mergedReports = { ...object(reports_by_stage) };
  for (const item of list(wave_result.results)) {
    const report = validReport(item);
    if (!report) continue;
    const stageId = text(item?.work_order?.stage_id).toUpperCase();
    if (!stageId) continue;
    const existing = list(mergedReports[stageId])
      .filter((entry) => Number(entry.requirement) !== Number(report.requirement));
    mergedReports[stageId] = [...existing, report];
  }

  const audit = [
    ...list(prior_audit),
    ...list(wave_result.results).map(auditRow),
  ];
  const office = evaluateProductionOffice({
    plan: production_room_pipeline,
    reports_by_stage: mergedReports,
  });
  const workOrders = createCurrentRoomWorkOrders({
    office,
    reports_by_stage: mergedReports,
  });

  return Object.freeze({
    contract: CREATIVE_PRODUCTION_SPECIALIST_WAVE_STATE_CONTRACT,
    reports_by_stage: mergedReports,
    specialist_wave_audit: audit,
    production_office: office,
    production_work_orders: workOrders,
    passed_workstream_count: list(wave_result.results).filter((item) => item?.result?.passed === true).length,
    repair_workstream_count: list(wave_result.results).filter((item) => item?.result?.completion?.repair_required === true).length,
    failed_workstream_count: list(wave_result.results).filter((item) => item?.status === "rejected").length,
    zero_media_generation: true,
  });
}

export const CreativeProductionSpecialistWaveStateRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_SPECIALIST_WAVE_STATE_CONTRACT,
  merge: mergeSpecialistWaveState,
});
