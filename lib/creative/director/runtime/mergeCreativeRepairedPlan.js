function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeCreativeRepairedPlan(basePlan = {}, repairedPlan = {}) {
  if (!isObject(basePlan)) {
    return isObject(repairedPlan) ? repairedPlan : basePlan;
  }
  if (!isObject(repairedPlan)) return basePlan;

  const merged = { ...basePlan };

  for (const [key, repairedValue] of Object.entries(repairedPlan)) {
    const baseValue = basePlan[key];

    if (Array.isArray(repairedValue)) {
      // Arrays are intentional production decisions. An empty repaired array can
      // be meaningful (for example clearing repair_before_production), so never
      // silently restore the old array.
      merged[key] = repairedValue;
      continue;
    }

    if (isObject(repairedValue) && isObject(baseValue)) {
      merged[key] = mergeCreativeRepairedPlan(baseValue, repairedValue);
      continue;
    }

    if (repairedValue !== undefined) {
      merged[key] = repairedValue;
    }
  }

  return merged;
}

export default mergeCreativeRepairedPlan;
