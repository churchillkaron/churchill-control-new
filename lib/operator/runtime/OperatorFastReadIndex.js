function read({ key, domain, capability, endpoint = null, aliases = [], description, scope = "organization", queryFields = [], staticQuery = {}, inputSchema = null, externalEvidence = false }) {
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
    input_schema: inputSchema || { type: "object", properties: {}, additionalProperties: true },
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
    external_evidence: externalEvidence === true,
    direct_query_fields: queryFields,
    direct_static_query: staticQuery,
  });
}

export const OPERATOR_FAST_READ_INDEX = Object.freeze([
  read({ key: "platform.weather.read", domain: "platform", capability: "weather", description: "Read current weather conditions and today's forecast for a specified location from a live public weather provider.", aliases: ["weather", "current weather", "weather today", "weather forecast", "temperature today", "is it raining", "rain today"], externalEvidence: true, inputSchema: { type: "object", required: ["location"], properties: { location: { type: "string", description: "City, area, island, province, or other place whose weather should be checked.", operator_input_extractor: "location_phrase" } }, additionalProperties: false } }),
  read({ key: "platform.time.read", domain: "platform", capability: "time", description: "Read the current local time and date for a specified location.", aliases: ["current time", "time now", "local time", "what time is it", "time in", "current local time"], externalEvidence: true, inputSchema: { type: "object", required: ["location"], properties: { location: { type: "string", description: "City, area, country, or place whose current local time should be checked.", operator_input_extractor: "location_phrase" } }, additionalProperties: false } }),
  read({ key: "operations.command_center.read", domain: "operations", capability: "command_center", endpoint: "/api/operations/command-center", scope: "organization", description: "Read current authorized operational assignments, active work, attention items, schedules, due status and accountable owners.", aliases: ["current operational assignments", "operational assignments", "current assignments", "operations status", "active operations", "active work", "work queue", "who is assigned", "what is assigned"], staticQuery: { capabilities: "all" } }),
  read({ key: "services.wallet.read", domain: "services", capability: "wallet", endpoint: "/api/platform/wallet", scope: "organization", description: "Read the current prepaid Services wallet balance and status.", aliases: ["service wallet", "wallet balance", "service balance", "service credit", "prepaid balance", "available service credit", "current wallet"] }),
  read({ key: "finance.vendor_bills.read", domain: "finance", capability: "vendor_bills", endpoint: "/api/finance/vendor-invoices/list", scope: "entity", description: "Read current vendor bills and supplier invoices, including vendor, status, invoice date and due date.", aliases: ["vendor bill", "vendor bills", "supplier invoice", "supplier invoices", "show vendor bills", "latest vendor bill", "accounts payable invoices", "unpaid vendor bills"], queryFields:["id","invoice_id","vendor_invoice_id"] }),
  read({ key: "finance.bank_statements.read", domain: "finance", capability: "bank_statements", endpoint: "/api/finance/bank-statements/runtime", scope: "entity", description: "Read imported bank statements and statement lines, including matched and unmatched reconciliation counts.", aliases: ["bank statement", "bank statements", "show bank statements", "latest bank statement", "statement lines", "unmatched bank transactions", "unreconciled bank transactions"], queryFields:["statementImportId","statement_import_id","lineOffset","lineLimit"] }),
  read({ key: "finance.journals.read", domain: "finance", capability: "journals", endpoint: "/api/finance/journals", scope: "entity", description: "Read journal entries and journal lines for the selected legal entity, including posting date, status, debit and credit totals.", aliases: ["journal", "journals", "journal entries", "show journals", "latest journal", "posted journals", "general journal"] }),
  read({ key: "finance.customer_invoices.read", domain: "finance", capability: "customer_invoices", endpoint: "/api/finance/customer-invoices", scope: "entity", description: "Read current customer invoices, invoice status, customer details, line items, PDF preview and paid receipt preview.", aliases: ["customer invoice", "customer invoices", "current customer invoices", "show current customer invoices", "open customer invoices", "current invoices", "show current invoices", "latest invoice", "latest customer invoice", "show invoice", "show invoice preview", "verify invoice created", "invoice actually created", "was invoice created", "invoice pdf", "paid receipt", "receipt preview"], queryFields:["id","invoice_id","partyId","party_id","include_lines","limit"] }),
  read({ key: "finance.cash_management.read", domain: "finance", capability: "cash_management", endpoint: "/api/finance/cash-management/runtime", scope: "entity", description: "Read current bank positions, working bank balances, liquidity, receivables and payables by currency.", aliases: ["bank balance", "bank balances", "current bank balance", "bank balance right now", "cash at bank", "cash position", "bank position", "liquidity"] }),
  read({ key: "finance.trial_balance.read", domain: "finance", capability: "trial_balance", endpoint: "/api/finance/trial-balance", scope: "entity", description: "Read the current trial balance for the selected entity and period.", aliases: ["trial balance", "current trial balance", "trial balance this period", "trial balance current period", "show trial balance", "is the trial balance balanced"] }),
  read({ key: "finance.profit_loss.read", domain: "finance", capability: "profit_loss", endpoint: "/api/finance/reports/profit-loss", scope: "entity", description: "Read the authoritative posted-ledger Profit & Loss for the selected entity and period, including revenue, COGS, expenses and net profit.", aliases: ["profit and loss", "profit loss", "p&l", "net profit", "revenue and expenses", "profit this period"] }),
  read({ key: "people.attendance.read", domain: "people", capability: "attendance", endpoint: "/api/people/workforce/attendance", scope: "entity", description: "Read current attendance, absences, late shifts and workforce attendance evidence.", aliases: ["who is absent today", "absent today", "attendance today", "late staff", "who is late", "attendance"] , queryFields:["month"]}),
  read({ key: "people.employees.read", domain: "people", capability: "employees", endpoint: "/api/people/directory", description: "Read the current employee directory and employment assignments.", aliases: ["employees", "employee directory", "staff list", "show staff", "who works here"] }),
  read({ key: "compliance.work_permits.read", domain: "compliance", capability: "work_permits", endpoint: "/api/workspace/compliance/work-permits", scope: "entity", description: "Read staff work permits with exact staff owner, legal employer, controlled document, expiry date, renewal window and current compliance status.", aliases: ["work permits", "staff work permits", "expiring work permits", "expired work permits", "whose work permit expires", "work permit expiry", "employee permits", "permit compliance"] }),
  read({ key: "solutions.hotel_bookings.read", domain: "solutions", capability: "hotel_bookings", endpoint: "/api/hotel/bookings/list", description: "Read current hotel bookings, arrivals, departures, guests and readiness.", aliases: ["hotel arrivals today", "arrivals today", "hotel bookings", "hotel guests", "departures today", "check ins today"] }),
  read({ key: "creative.assets.read", domain: "creative", capability: "assets", endpoint: "/api/creative/assets/search", description: "Read current Creative Studio image, video, audio and document assets with preview URLs.", aliases: ["studio assets", "show studio image", "show studio video", "show image", "show video", "creative assets", "latest image", "latest video", "preview image", "preview video"], queryFields:["creativeProjectId","query"] }),
  read({ key: "creative.production.read", domain: "creative", capability: "production", endpoint: "/api/creative/production", description: "Read current Creative Studio production state for a project.", aliases: ["studio production", "production status", "video production", "creative production"], queryFields:["creativeProjectId"] }),
  read({ key: "documents.documents.read", domain: "documents", capability: "documents", endpoint: "/api/documents", description: "Read current organization documents and available document files, previews and downloads.", aliases: ["documents", "show documents", "latest document", "pdf", "show pdf", "document preview", "download document", "open document"], queryFields:["q","status","type","source","limit"] }),
  read({ key: "commercial.quotations.read", domain: "commercial", capability: "quotations", endpoint: "/api/commercial/sales/quotations", scope: "entity", description: "Read current customer quotations and quotation status.", aliases: ["quotation", "quotations", "customer quotation", "latest quotation", "show quotation", "show quote", "quote status"], queryFields:["status","limit"] }),
  read({ key: "commercial.customers.read", domain: "commercial", capability: "customers", endpoint: "/api/commercial/customers", description: "Read current customers and customer records, with name search and exact party lookup.", aliases: ["customers", "customer list", "find customer", "show customers"], queryFields:["query","limit","partyId","party_id"] }),
  read({ key: "supply_chain.inventory_items.read", domain: "supply-chain", capability: "inventory_items", endpoint: "/api/inventory/items", description: "Read current inventory items and stock master data.", aliases: ["inventory items", "stock items", "show inventory", "inventory list"] }),
  read({ key: "supply_chain.stock_position.read", domain: "supply-chain", capability: "stock_position", endpoint: "/api/inventory/stock-position", description: "Read current stock positions and quantities.", aliases: ["stock position", "stock balance", "stock on hand", "how much stock", "inventory balance"] }),
]);

export function listOperatorFastReads() {
  return [...OPERATOR_FAST_READ_INDEX];
}
