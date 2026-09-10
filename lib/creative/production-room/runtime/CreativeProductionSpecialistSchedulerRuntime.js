import {
  executeProductionSpecialistWorkOrder,
} from "./CreativeProductionSpecialistExecutionRuntime.js";

export const CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_CONTRACT =
  "CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function planSpecialistExecutionWave({ work_orders = [], max_concurrency = 4 } = {}) {
  const limit = Math.max(1, Math.min(8, integer(max_concurrency, 4)));
  const ready = list(work_orders).filter((order) => order?.status === "READY");
  const blocked = list(work_orders).filter((order) => order?.status !== "READY");
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_CONTRACT,
    ready,
    blocked,
    wave: ready.slice(0, limit),
    deferred: ready.slice(limit),
    max_concurrency: limit,
    media_generation_authority: false,
  });
}
export async function executeSpecialistExecutionWave({
  organization_id,
  creative_project_id,
  work_orders = [],
  production_context = {},
  max_concurrency = 4,
  execution_runtime,
} = {}) {
  const plan = planSpecialistExecutionWave({ work_orders, max_concurrency });
  const settled = await Promise.allSettled(
    plan.wave.map((work_order) =>
      executeProductionSpecialistWorkOrder({
        organization_id,
        creative_project_id,
        work_order,
        production_context,
        execution_runtime,
      }),
    ),
  );
  const results = settled.map((item, index) => ({
    work_order: plan.wave[index],
    status: item.status,
    result: item.status === "fulfilled" ? item.value : null,
    error: item.status === "rejected" ? String(item.reason?.message || item.reason) : null,
  }));
  const passed = results.filter((item) => item.result?.passed === true);
  const repair = results.filter((item) => item.status === "fulfilled" && item.result?.passed !== true);
  const failed = results.filter((item) => item.status === "rejected");
  return Object.freeze({
    contract: CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_CONTRACT,
    passed: failed.length === 0 && repair.length === 0,
    wave_size: plan.wave.length,
    passed_count: passed.length,
    repair_count: repair.length,
    failed_count: failed.length,
    deferred_count: plan.deferred.length,
    results,
    deferred: plan.deferred,
    blocked: plan.blocked,
    media_generation_executed: false,
    media_generation_authority: false,
  });
}

export const CreativeProductionSpecialistSchedulerRuntime = Object.freeze({
  contract: CREATIVE_PRODUCTION_SPECIALIST_SCHEDULER_CONTRACT,
  planWave: planSpecialistExecutionWave,
  executeWave: executeSpecialistExecutionWave,
});
