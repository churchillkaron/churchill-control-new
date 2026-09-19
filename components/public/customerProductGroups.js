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
    headline: "Intelligence that understands context and gets work done.",
    description: "Business Partner, specialist agents and live insights that read evidence, reason across the business, execute approved capabilities, verify results and keep durable proof.",
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
    id: "communications-reputation",
    label: "Communications & Reputation",
    headline: "One conversation layer across every customer channel.",
    description: "WhatsApp, LINE, Messenger, Instagram, email, social connections and review response tied back to the same customer and business context.",
    families: ["communications-reputation"],
  },
  {
    id: "portals-external",
    label: "Portals & External Experience",
    headline: "One connected experience for customers, staff and suppliers.",
    description: "Customer, staff and supplier portals connected to the same bookings, payments, work, documents, messages and business records underneath.",
    families: ["portals-external"],
  },
  {
    id: "web-commerce",
    label: "Web & Commerce",
    headline: "Build the customer-facing business, not just the back office.",
    description: "Websites, webshops, connected commerce, products, orders and inventory working with the same business context.",
    families: ["web-commerce"],
  },
  {
    id: "markets",
    label: "Markets",
    headline: "Research, test and operate market decisions with evidence and control.",
    description: "Live market evidence, specialist agents, strategy validation, portfolio risk and autonomous paper trading — with real execution still deliberately gated.",
    families: ["markets"],
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
  intelligence: ["intelligence", "business-partner", "company-memory"],
  creative: ["creative-studio", "image-studio", "video-studio"],
  "communications-reputation": ["unified-communications", "social-channels", "reviews-reputation"],
  "portals-external": ["customer-portal", "staff-portal", "supplier-portal"],
  "web-commerce": ["website-builder", "webshop-commerce", "shopify-commerce"],
  markets: ["avantiqo-markets", "markets-risk-execution", "markets-learning"],
  industry: ["restaurant-system", "hotel-system", "field-service-system"],
};

export const CUSTOMER_EXCLUDED_PRODUCT_IDS = new Set([
  "image-generation-api",
  "video-generation-api",
  "code-studio",
]);

const PUBLIC_PORTAL_PRODUCT_IDS = new Set(["customer-portal", "staff-portal", "supplier-portal"]);

export function isCustomerProduct(product) {
  return product.family !== "platform" && (product.status !== "planned" || PUBLIC_PORTAL_PRODUCT_IDS.has(product.id)) && !CUSTOMER_EXCLUDED_PRODUCT_IDS.has(product.id);
}
