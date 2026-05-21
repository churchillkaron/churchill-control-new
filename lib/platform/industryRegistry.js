export const INDUSTRY_REGISTRY = [
  {
    id: "restaurant",
    name: "Restaurant",
    route: "/restaurant",
    workspaces: [
      { id: "floor", name: "Floor", route: "/floor" },
      { id: "pos", name: "POS", route: "/pos" },
      { id: "kitchen", name: "Kitchen", route: "/kitchen" },
      { id: "expo", name: "Expo", route: "/expo" },
      { id: "reservations", name: "Reservations", route: "/reservations" },
    ],
    recommended_modules: [
      "inventory",
      "procurement",
      "finance",
      "accounting",
      "payroll",
      "analytics",
      "marketing_ai",
      "owner_ai",
    ],
  },

  {
    id: "construction",
    name: "Construction",
    route: "/construction",
    workspaces: [
      { id: "projects", name: "Projects", route: "/construction/projects" },
      { id: "timeline", name: "Timeline", route: "/construction/timeline" },
      { id: "boq", name: "BOQ / Calculation", route: "/construction/boq" },
      { id: "site", name: "Site Operations", route: "/construction/site" },
      { id: "materials", name: "Materials", route: "/construction/materials" },
      { id: "equipment", name: "Equipment", route: "/construction/equipment" },
      { id: "subcontractors", name: "Subcontractors", route: "/construction/subcontractors" },
      { id: "billing", name: "Project Billing", route: "/construction/billing" },
    ],
    recommended_modules: [
      "inventory",
      "procurement",
      "finance",
      "accounting",
      "payroll",
      "crm",
      "analytics",
      "owner_ai",
      "marketing_ai",
    ],
  },

  {
    id: "hotel",
    name: "Hotel",
    route: "/hotel",
    workspaces: [
      { id: "frontdesk", name: "Front Desk", route: "/hotel/frontdesk" },
      { id: "reservations", name: "Reservations", route: "/hotel/reservations" },
      { id: "housekeeping", name: "Housekeeping", route: "/hotel/housekeeping" },
      { id: "maintenance", name: "Maintenance", route: "/hotel/maintenance" },
      { id: "concierge", name: "Concierge", route: "/hotel/concierge" },
    ],
    recommended_modules: [
      "crm",
      "customer_portal",
      "inventory",
      "procurement",
      "finance",
      "accounting",
      "payroll",
      "analytics",
      "marketing_ai",
      "owner_ai",
    ],
  },

  {
    id: "retail",
    name: "Retail",
    route: "/retail",
    workspaces: [
      { id: "stores", name: "Stores", route: "/retail/stores" },
      { id: "pos", name: "POS", route: "/retail/pos" },
      { id: "warehouse", name: "Warehouse", route: "/retail/warehouse" },
      { id: "pricing", name: "Pricing", route: "/retail/pricing" },
      { id: "loyalty", name: "Loyalty", route: "/retail/loyalty" },
    ],
    recommended_modules: [
      "pos",
      "inventory",
      "procurement",
      "finance",
      "accounting",
      "crm",
      "analytics",
      "marketing_ai",
      "owner_ai",
    ],
  },
];

export function getIndustryById(industryId) {
  return INDUSTRY_REGISTRY.find((industry) => industry.id === industryId);
}
