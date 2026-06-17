/**
 * AVANTIQO MODULE ENTITLEMENTS
 * FINAL SAAS CONTROL LAYER
 */

export const MODULE_PLANS = {
  free: ["pos", "inventory"],
  pro: ["pos", "inventory", "finance", "marketing"],
  enterprise: [
    "pos",
    "inventory",
    "finance",
    "marketing",
    "workforce",
    "automation",
    "intelligence",
    "healthcare",
  ],
};

export function getPlanModules(plan = "free") {
  return MODULE_PLANS[plan] || MODULE_PLANS.free;
}

export function filterModulesByPlan(modules = [], plan = "free") {
  const allowed = getPlanModules(plan);

  return modules.filter((m) => allowed.includes(m.key));
}
