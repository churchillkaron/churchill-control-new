function read({ key, domain, capability, endpoint, aliases = [], description, scope = "organization", queryFields = [] }) {
  return Object.freeze({
    key,
    domain,
    capability,
    action: "read",
    name: capability.replaceAll("_", " "),
    description,
    operator_aliases: aliases,
    operator_examples: aliases,
    permissions: [],
    tags: [domain, capability, "fast-read-index"],
    context_scope: scope,
    input_schema: { type: "object", properties: {}, additionalProperties: true },
    output_schema: null,
    mode: "read",
    risk: "low",
    approval: null,
    reversible: true,
    transactional: false,
    auto_execute: true,
    requires_confirmation: false,
    ai_enabled: false,
    operator_enabled: true,
    direct_endpoint: endpoint,
    direct_query_fields: queryFields,
  });
}

export const OPERATOR_FAST_READ_INDEX = Object.freeze([
  read({ key: "finance.customer_invoices.read", domain: "finance", capability: "customer_invoices", endpoint: "/api/finance/customer-invoices", scope: "entity", description: "Read current customer invoices, invoice status, customer details, PDF preview and paid receipt preview.", aliases: ["customer invoice", "customer invoices", "latest invoice", "latest customer invoice", "invoice moonshine", "show invoice", "show invoice preview", "invoice pdf", "paid receipt", "receipt preview"] }),
  read({ key: "finance.cash_management.read", domain: "finance", capability: "cash_management", endpoint: "/api/finance/cash-management/runtime", scope: "entity", description: "Read current bank positions, working bank balances, liquidity, receivables and payables by currency.", aliases: ["bank balance", "bank balances", "cash at bank", "cash position", "bank position", "liquidity"] }),
  read({ key: "finance.trial_balance.read", domain: "finance", capability: "trial_balance", endpoint: "/api/finance/trial-balance", scope: "entity", description: "Read the current trial balance for the selected entity and period.", aliases: ["trial balance", "show trial balance", "is the trial balance balanced"] }),
  read({ key: "people.attendance.read", domain: "people", capability: "attendance", endpoint: "/api/people/workforce/attendance", scope: "entity", description: "Read current attendance, absences, late shifts and workforce attendance evidence.", aliases: ["who is absent today", "absent today", "attendance today", "late staff", "who is late", "attendance"] , queryFields:["month"]}),
  read({ key: "people.employees.read", domain: "people", capability: "employees", endpoint: "/api/people/directory", description: "Read the current employee directory and employment assignments.", aliases: ["employees", "employee directory", "staff list", "show staff", "who works here"] }),
  read({ key: "solutions.hotel_bookings.read", domain: "solutions", capability: "hotel_bookings", endpoint: "/api/hotel/bookings/list", description: "Read current hotel bookings, arrivals, departures, guests and readiness.", aliases: ["hotel arrivals today", "arrivals today", "hotel bookings", "hotel guests", "departures today", "check ins today"] }),
  read({ key: "creative.assets.read", domain: "creative", capability: "assets", endpoint: "/api/creative/assets/search", description: "Read current Creative Studio image, video, audio and document assets with preview URLs.", aliases: ["studio assets", "show studio image", "show studio video", "show image", "show video", "creative assets", "latest image", "latest video", "preview image", "preview video"], queryFields:["creativeProjectId","query"] }),
  read({ key: "creative.production.read", domain: "creative", capability: "production", endpoint: "/api/creative/production", description: "Read current Creative Studio production state for a project.", aliases: ["studio production", "production status", "video production", "creative production"], queryFields:["creativeProjectId"] }),
  read({ key: "documents.documents.read", domain: "documents", capability: "documents", endpoint: "/api/documents", description: "Read current organization documents and available document files.", aliases: ["documents", "show documents", "latest document", "pdf", "show pdf", "document preview"] }),
  read({ key: "commercial.customers.read", domain: "commercial", capability: "customers", endpoint: "/api/commercial/customers", description: "Read current customers and customer records.", aliases: ["customers", "customer list", "find customer", "show customers"] }),
  read({ key: "supply_chain.inventory_items.read", domain: "supply-chain", capability: "inventory_items", endpoint: "/api/inventory/items", description: "Read current inventory items and stock master data.", aliases: ["inventory items", "stock items", "show inventory", "inventory list"] }),
  read({ key: "supply_chain.stock_position.read", domain: "supply-chain", capability: "stock_position", endpoint: "/api/inventory/stock-position", description: "Read current stock positions and quantities.", aliases: ["stock position", "stock balance", "stock on hand", "how much stock", "inventory balance"] }),
]);

export function listOperatorFastReads() {
  return [...OPERATOR_FAST_READ_INDEX];
}
