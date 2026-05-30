import { loadDomains } from "@/lib/platform/domains/registry/loadDomains";
export const SYSTEM_REGISTRY = {

  runtime: {

    title: "Runtime",

    owner: "Enterprise Runtime",

    status: "CORE",

    domains: [

      {
        name: "dashboard",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "monitoring",
        status: "CORE",
        type: "RUNTIME",
        keep: true,
      },

      {
        name: "intelligence",
        status: "CORE",
        type: "AI",
        keep: true,
      },

      {
        name: "automation",
        status: "CORE",
        type: "AUTOMATION",
        keep: true,
      },

      {
        name: "governance",
        status: "CORE",
        type: "GOVERNANCE",
        keep: true,
      },

      {
        name: "management",
        status: "CORE",
        type: "MANAGEMENT",
        keep: true,
      },

    ],

  },

  operations: {

    title: "Operations",

    owner: "Operational Systems",

    status: "CORE",

    domains: [

      {
        name: "pos",
        status: "CORE",
        type: "OPERATIONS",
        keep: true,
      },

      {
        name: "pos/payments",
        status: "CORE",
        type: "OPERATIONS",
        keep: true,
      },

      {
        name: "production",
        status: "CORE",
        type: "OPERATIONS",
        keep: true,
      },

      {
        name: "inventory",
        status: "CORE",
        type: "OPERATIONS",
        keep: true,
      },

      {
        name: "procurement",
        status: "CORE",
        type: "OPERATIONS",
        keep: true,
      },

    ],

  },

  finance: {

    title: "Finance",

    owner: "Financial Systems",

    status: "CORE",

    domains: [

      {
        name: "finance",
        status: "CORE",
        type: "FINANCE",
        keep: true,
      },

      {
        name: "payroll",
        status: "CORE",
        type: "FINANCE",
        keep: true,
      },

      {
        name: "analytics",
        status: "CORE",
        type: "ANALYTICS",
        keep: true,
      },

      {
        name: "history",
        status: "ACTIVE",
        type: "ANALYTICS",
        keep: true,
      },

    ],

  },

  people: {

    title: "People",

    owner: "People Operations",

    status: "ACTIVE",

    domains: [

      {
        name: "staff",
        status: "ACTIVE",
        type: "PEOPLE",
        keep: true,
      },

    ],

  },

  growth: {

    title: "Growth",

    owner: "Growth & Marketing",

    status: "ACTIVE",

    domains: [

      {
        name: "marketing",
        status: "ACTIVE",
        type: "GROWTH",
        keep: true,
      },

    ],

  },

  platform: {

    title: "Platform",

    owner: "Platform Systems",

    status: "ACTIVE",

    domains: [

      {
        name: "settings",
        status: "ACTIVE",
        type: "PLATFORM",
        keep: true,
      },

    ],

  },

};
