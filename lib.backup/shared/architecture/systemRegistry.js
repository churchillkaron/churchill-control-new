export const SYSTEM_REGISTRY = {

  runtime: {

    title: "Runtime",

    owner: "Core Runtime Systems",

    status: "CORE",

    domains: [

      {
        name: "dashboard",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "control",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "command",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "management",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "intelligence",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

    ],

  },

  operations: {

    title: "Operations",

    owner: "Operational Execution",

    status: "CORE",

    domains: [

      {
        name: "floor",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "kitchen",
        status: "CORE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "expo",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "orders",
        status: "ACTIVE",
        type: "SERVICE",
        keep: true,
      },

      {
        name: "bar",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "service",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "waiter",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

    ],

  },

  business: {

    title: "Business",

    owner: "Business Systems",

    status: "CORE",

    domains: [

      {
        name: "pos",
        status: "CORE",
        type: "MODULE",
        keep: true,
      },

      {
        name: "inventory",
        status: "CORE",
        type: "MODULE",
        keep: true,
      },

      {
        name: "procurement",
        status: "CORE",
        type: "MODULE",
        keep: true,
      },

      {
        name: "finance",
        status: "CORE",
        type: "MODULE",
        keep: true,
      },

      {
        name: "accounting",
        status: "ACTIVE",
        type: "MODULE",
        keep: true,
      },

      {
        name: "marketing",
        status: "CORE",
        type: "MODULE",
        keep: true,
      },

      {
        name: "production",
        status: "CORE",
        type: "MODULE",
        keep: true,
      },

    ],

  },

  staff: {

    title: "Staff",

    owner: "Human Operations",

    status: "ACTIVE",

    domains: [

      {
        name: "staff",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "attendance",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "performance",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "reviews",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "earnings",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

      {
        name: "messages",
        status: "ACTIVE",
        type: "WORKSPACE",
        keep: true,
      },

    ],

  },

  creative: {

    title: "Creative",

    owner: "Creative Systems",

    status: "ACTIVE",

    domains: [

      {
        name: "branding",
        status: "ACTIVE",
        type: "CREATIVE",
        keep: true,
      },

      {
        name: "marketing/design",
        status: "ACTIVE",
        type: "CREATIVE",
        keep: true,
      },

      {
        name: "marketing/assets",
        status: "ACTIVE",
        type: "CREATIVE",
        keep: true,
      },

    ],

  },

  insights: {

    title: "Insights",

    owner: "Analytics & Forecasting",

    status: "CORE",

    domains: [

      {
        name: "analytics",
        status: "CORE",
        type: "INSIGHT",
        keep: true,
      },

      {
        name: "forecasting",
        status: "CORE",
        type: "INSIGHT",
        keep: true,
      },

      {
        name: "reports",
        status: "CORE",
        type: "INSIGHT",
        keep: true,
      },

      {
        name: "recommendations",
        status: "ACTIVE",
        type: "AI",
        keep: true,
      },

      {
        name: "anomaly",
        status: "ACTIVE",
        type: "AI",
        keep: true,
      },

    ],

  },

  intelligence: {

    title: "Intelligence",

    owner: "AI Orchestration",

    status: "CORE",

    domains: [

      {
        name: "intelligence",
        status: "CORE",
        type: "PLATFORM",
        keep: true,
      },

      {
        name: "command",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "control",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

    ],

  },

  governance: {

    title: "Governance",

    owner: "Platform Governance",

    status: "ACTIVE",

    domains: [

      {
        name: "management",
        status: "ACTIVE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "approval",
        status: "ACTIVE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "audit",
        status: "ACTIVE",
        type: "RUNTIME",
        keep: true,
      },

    ],

  },

};
