export const CUSTOMER_PRODUCT_GROUPS = [
  {
    id: "run-business",
    label: "Run the Business",
    headline: "Daily operations, customers and service.",
    description: "Sell, book, serve, take payment and keep the day moving.",
    families: ["sell-serve", "customer-growth"],
  },
  {
    id: "people",
    label: "People & Work",
    headline: "Schedule people and manage the work.",
    description: "Workforce, payroll, attendance, projects, field service and approvals.",
    families: ["people-work"],
  },
  {
    id: "finance",
    label: "Finance & Control",
    headline: "Know where the money is going.",
    description: "Invoices, bills, banking, reconciliation, tax, close and reporting.",
    families: ["money-control"],
  },
  {
    id: "stock",
    label: "Stock & Supply",
    headline: "Buy, count, cost and replenish.",
    description: "Inventory, purchasing, receiving, recipes, food cost and production.",
    families: ["stock-supply"],
  },
];
export const CUSTOMER_PRODUCT_GROUPS_MORE = [
  {
    id: "documents",
    label: "Documents & Automation",
    headline: "Turn paperwork into work that gets done.",
    description: "Capture invoices, receipts and documents, route approvals and automate the next step.",
    families: ["documents-automation"],
  },
  {
    id: "intelligence",
    label: "AI & Intelligence",
    headline: "Ask the business. Understand what needs attention.",
    description: "Business Partner, agents and insights connected to real operating data.",
    families: ["intelligence"],
  },
  {
    id: "creative",
    label: "Creative & Marketing",
    headline: "Create, publish and grow from one place.",
    description: "Campaigns, image, video, music, voice and marketing production.",
    families: ["creative"],
  },
  {
    id: "industry",
    label: "Industry Systems",
    headline: "A complete operating setup for your kind of business.",
    description: "Restaurant, hotel, retail, field service, accounting, agency and more.",
    families: ["industry"],
  },
];

export const CUSTOMER_GROUPS = [...CUSTOMER_PRODUCT_GROUPS, ...CUSTOMER_PRODUCT_GROUPS_MORE];
export const CUSTOMER_FEATURES = {
  "run-business": ["pos", "bookings", "crm"],
  people: ["workforce", "payroll", "field-service"],
  finance: ["finance", "invoicing", "bank-reconciliation"],
  stock: ["inventory", "procurement", "warehouse"],
  documents: ["invoice-intelligence", "document-workflows", "automations"],
  intelligence: ["business-partner", "agents", "insights"],
  creative: ["creative-studio", "image-studio", "video-studio"],
  industry: ["restaurant-system", "hotel-system", "field-service-system"],
};

export const CUSTOMER_EXCLUDED_PRODUCT_IDS = new Set([
  "image-generation-api",
  "video-generation-api",
  "code-studio",
]);

export function isCustomerProduct(product) {
  return product.family !== "platform" && !CUSTOMER_EXCLUDED_PRODUCT_IDS.has(product.id);
}
