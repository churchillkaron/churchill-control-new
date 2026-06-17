/**
 * AVANTIQO SUBSCRIPTION STATE ENGINE
 */

export const SUBSCRIPTION_PLANS = {
  free: {
    name: "Free",
    modules: ["pos"],
    limits: {
      users: 5,
      organizations: 1,
    },
  },

  pro: {
    name: "Pro",
    modules: ["pos", "inventory", "finance", "marketing"],
    limits: {
      users: 25,
      organizations: 3,
    },
  },

  enterprise: {
    name: "Enterprise",
    modules: [
      "pos",
      "inventory",
      "finance",
      "marketing",
      "workforce",
      "automation",
      "intelligence",
      "healthcare",
    ],
    limits: {
      users: -1,
      organizations: -1,
    },
  },
};

export function getPlanConfig(plan = "free") {
  return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
}
