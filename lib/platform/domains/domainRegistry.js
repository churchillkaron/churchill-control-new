export const DOMAIN_REGISTRY = {

  // OPERATIONS

  floor: {

    title: "Floor",

    category: "operations",

    type: "workspace",

    route: "/floor",

    description:
      "Restaurant floor management and table operations.",

    permissions: [
      "floor.view",
      "floor.manage",
    ],

    industries: [
      "restaurant",
    ],

  },

  kitchen: {

    title: "Kitchen",

    category: "operations",

    type: "workspace",

    route: "/operations/kitchen",

    description:
      "Kitchen production and execution workflows.",

    permissions: [
      "kitchen.view",
      "kitchen.manage",
    ],

    industries: [
      "restaurant",
    ],

  },

  expo: {

    title: "Expo",

    category: "operations",

    type: "workspace",

    route: "/expo",

    description:
      "Expediting and order coordination.",

    permissions: [
      "expo.view",
      "expo.manage",
    ],

    industries: [
      "restaurant",
    ],

  },

  // BUSINESS

  pos: {

    title: "POS",

    category: "business",

    type: "module",

    route: "/operations/pos",

    description:
      "Universal point-of-sale system.",

    permissions: [
      "pos.view",
      "pos.manage",
    ],

    industries: [
      "restaurant",
      "hotel",
      "retail",
    ],

  },

  inventory: {

    title: "Inventory",

    category: "business",

    type: "module",

    route: "/inventory",

    description:
      "Stock and warehouse management.",

    permissions: [
      "inventory.view",
      "inventory.manage",
    ],

    industries: [
      "restaurant",
      "hotel",
      "retail",
      "construction",
    ],

  },

  procurement: {

    title: "Procurement",

    category: "business",

    type: "module",

    route: "/procurement",

    description:
      "Purchasing and supplier workflows.",

    permissions: [
      "procurement.view",
      "procurement.manage",
    ],

    industries: [
      "restaurant",
      "hotel",
      "retail",
      "construction",
    ],

  },

  finance: {

    title: "Finance",

    category: "business",

    type: "module",

    route: "/finance",

    description:
      "Enterprise financial management.",

    permissions: [
      "finance.view",
      "finance.manage",
    ],

    industries: [
      "all",
    ],

  },

  marketing: {

    title: "Marketing",

    category: "business",

    type: "module",

    route: "/marketing",

    description:
      "Campaigns, channels and marketing operations.",

    permissions: [
      "marketing.view",
      "marketing.manage",
    ],

    industries: [
      "all",
    ],

  },

  // STAFF

  staff: {

    title: "Workforce",

    category: "staff",

    type: "workspace",

    route: "/workforce",

    description:
      "Human operations and workforce management.",

    permissions: [
      "staff.view",
      "staff.manage",
    ],

    industries: [
      "all",
    ],

  },

  // CREATIVE

  branding: {

    title: "Branding",

    category: "creative",

    type: "creative",

    route: "/branding",

    description:
      "Brand identity and creative systems.",

    permissions: [
      "branding.view",
      "branding.manage",
    ],

    industries: [
      "all",
    ],

  },

  // INSIGHTS

  analytics: {

    title: "Analytics",

    category: "insights",

    type: "insight",

    route: "/analytics",

    description:
      "KPIs, dashboards and business intelligence.",

    permissions: [
      "analytics.view",
    ],

    industries: [
      "all",
    ],

  },

  forecasting: {

    title: "Forecasting",

    category: "insights",

    type: "insight",

    route: "/forecasting",

    description:
      "Forecasting and predictive systems.",

    permissions: [
      "forecasting.view",
    ],

    industries: [
      "all",
    ],

  },

  // INTELLIGENCE

  intelligence: {

    title: "Intelligence",

    category: "intelligence",

    type: "platform",

    route: "/intelligence",

    description:
      "AI orchestration and executive intelligence.",

    permissions: [
      "intelligence.view",
    ],

    industries: [
      "all",
    ],

  },

};

/**
 * SAFE UI COMPATIBILITY LAYER
 * Provides active domains for frontend
 */

export function getActiveDomains() {
  return Object.values(DOMAIN_REGISTRY)
    .filter(d => d.keep !== false)
    .map(d => ({
      name: d.title,
      key: d.title?.toLowerCase?.() || d.category,
      category: d.category,
    }));
}
