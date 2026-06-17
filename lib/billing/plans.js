export const PLANS = {
  starter: {
    name: "Starter",
    priceId: "price_starter",
    limits: {
      ai_reasoning: true,
      command_center: false,
      auto_execution: false,
      multi_org: false,
    },
  },

  pro: {
    name: "Pro",
    priceId: "price_pro",
    limits: {
      ai_reasoning: true,
      command_center: true,
      auto_execution: false,
      multi_org: false,
    },
  },

  enterprise: {
    name: "Enterprise",
    priceId: "price_enterprise",
    limits: {
      ai_reasoning: true,
      command_center: true,
      auto_execution: true,
      multi_org: true,
    },
  },
};
