const DISABLED_ERROR =
  "LEGACY_CREATIVE_DIRECTION_EXECUTION_REPAIR_DISABLED";

export function installCreativeDirectionExecutionRepairPatch() {
  throw new Error(DISABLED_ERROR);
}

export function repairCreativeDirectionPlan() {
  throw new Error(DISABLED_ERROR);
}

export const CreativeDirectionExecutionRepairPatch = Object.freeze({
  disabled: true,
  reason:
    "Legacy repair rewrote dynamic temporal plans with project-specific defaults and duplicated stale shot sources. Canonical creative planning must produce a fresh validated plan instead.",
  install: installCreativeDirectionExecutionRepairPatch,
  repair: repairCreativeDirectionPlan,
});
