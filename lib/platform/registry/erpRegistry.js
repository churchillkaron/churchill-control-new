export const ERP_REGISTRY = {
  domains: [
    {
      id: "home",
      name: "Home",
      route: "/dashboard",
      type: "core",
      order: 10,
      description: "Your command center.",
    },
    {
      id: "commercial",
      name: "Commercial",
      route: "/commercial",
      type: "core",
      order: 20,
      description: "Sales, orders, pricing, contracts and revenue activity.",
    },
    {
      id: "customers",
      name: "Customers",
      route: "/customers",
      type: "core",
      order: 30,
      description: "Customer records, relationships, communication and service.",
    },
    {
      id: "operations",
      name: "Operations",
      route: "/operations",
      type: "core",
      order: 40,
      description: "Industry operations, service delivery and daily execution.",
    },
    {
      id: "supply-chain",
      name: "Supply Chain",
      route: "/supply-chain",
      type: "core",
      order: 50,
      description: "Inventory, procurement, suppliers, receiving and logistics.",
    },
    {
      id: "finance",
      name: "Finance",
      route: "/finance",
      type: "core",
      order: 60,
      description: "Accounting, treasury, tax, close, controls and reporting.",
    },
    {
      id: "people",
      name: "People",
      route: "/people",
      type: "core",
      order: 70,
      description: "Employees, scheduling, payroll, attendance and performance.",
    },
    {
      id: "projects",
      name: "Projects",
      route: "/projects",
      type: "core",
      order: 80,
      description: "Projects, tasks, resources, planning, time and costs.",
    },
    {
      id: "documents",
      name: "Documents",
      route: "/documents",
      type: "core",
      order: 90,
      description: "Files, OCR, contracts, receipts, media and knowledge.",
    },
    {
      id: "analytics",
      name: "Analytics",
      route: "/analytics",
      type: "core",
      order: 100,
      description: "Dashboards, KPIs, reports, BI and forecasts.",
    },
    {
      id: "ai",
      name: "AI",
      route: "/intelligence",
      type: "core",
      order: 110,
      description: "Assistants, agents, automations and recommendations.",
    },
    {
      id: "administration",
      name: "Administration",
      route: "/settings",
      type: "core",
      order: 120,
      description: "Organizations, users, permissions, packages and platform setup.",
    },
  ],

  packages: [
    { id: "restaurant", name: "Restaurant", route: "/operations/restaurant", order: 10 },
    { id: "hotel", name: "Hotel", route: "/operations/hotel", order: 20 },
    { id: "healthcare", name: "Healthcare", route: "/operations/healthcare", order: 30 },
    { id: "construction", name: "Construction", route: "/operations/construction", order: 40 },
    { id: "manufacturing", name: "Manufacturing", route: "/operations/manufacturing", order: 50 },
    { id: "retail", name: "Retail", route: "/operations/retail", order: 60 },
    { id: "pest_control", name: "Pest Control", route: "/operations/pest-control", order: 70 },
    { id: "accounting_firm", name: "Accounting Firm", route: "/finance/accounting-firm", order: 80 },
  ],

  workspaces: {
    home: {
      title: "Home",
      description: "Your business command center.",
      groups: [
        {
          id: "today",
          name: "Today",
          description: "Start here for daily work.",
          order: 10,
          items: [
            { id: "dashboard", name: "Dashboard", route: "/dashboard", description: "Open the main command center.", order: 10 },
            { id: "alerts", name: "Alerts", route: "/dashboard/alerts", description: "Review operational and financial alerts.", order: 20 },
            { id: "tasks", name: "Tasks", route: "/tasks", description: "Review work assigned to you.", order: 30 },
          ],
        },
      ],
    },

    commercial: {
      title: "Commercial",
      description: "Manage sales, orders, pricing, campaigns and revenue activity.",
      groups: [
        {
          id: "sales",
          name: "Sales",
          description: "Quotes, orders, contracts and commercial execution.",
          order: 10,
          items: [
            { id: "sales_orders", name: "Sales Orders", route: "/commercial/orders", description: "Create and manage customer orders.", order: 10 },
            { id: "quotes", name: "Quotes", route: "/commercial/quotes", description: "Prepare and track customer quotes.", order: 20 },
            { id: "contracts", name: "Contracts", route: "/commercial/contracts", description: "Manage customer contracts and terms.", order: 30 },
            { id: "pricing", name: "Pricing", route: "/commercial/pricing", description: "Maintain prices, discounts and rules.", order: 40 },
          ],
        },
        {
          id: "marketing",
          name: "Marketing",
          description: "Campaigns, content, channels and growth execution.",
          order: 20,
          items: [
            { id: "campaigns", name: "Campaigns", route: "/marketing", description: "Plan and run campaigns.", order: 10 },
            { id: "social_publishing", name: "Social Publishing", route: "/marketing/social", description: "Publish to social channels.", order: 20 },
            { id: "design_studio", name: "Design Studio", route: "/marketing/design", description: "Create brand and campaign assets.", order: 30 },
            { id: "reviews", name: "Reviews", route: "/marketing/reviews", description: "Manage reviews and reputation.", order: 40 },
          ],
        },
        {
          id: "digital",
          name: "Digital",
          description: "Website, customer portal and online channels.",
          order: 30,
          items: [
            { id: "website", name: "Website", route: "/commercial/website", description: "Manage web presence.", order: 10 },
            { id: "customer_portal", name: "Customer Portal", route: "/customer-portal", description: "Manage customer self-service.", order: 20 },
            { id: "ecommerce", name: "E-commerce", route: "/commercial/ecommerce", description: "Manage online sales.", order: 30 },
          ],
        },
      ],
    },

    customers: {
      title: "Customers",
      description: "Manage customer relationships, service, loyalty and communication.",
      groups: [
        {
          id: "relationships",
          name: "Relationships",
          description: "Accounts, contacts, leads and profiles.",
          order: 10,
          items: [
            { id: "accounts", name: "Accounts", route: "/customers/accounts", description: "Manage customer accounts.", order: 10 },
            { id: "contacts", name: "Contacts", route: "/customers", description: "Manage contacts and customer records.", order: 20 },
            { id: "leads", name: "Leads", route: "/customers/leads", description: "Track leads and opportunities.", order: 30 },
            { id: "loyalty", name: "Loyalty", route: "/customers/loyalty", description: "Manage loyalty programs.", order: 40 },
          ],
        },
        {
          id: "service",
          name: "Service",
          description: "Customer cases, communication and support.",
          order: 20,
          items: [
            { id: "cases", name: "Cases", route: "/customers/cases", description: "Manage customer support cases.", order: 10 },
            { id: "activities", name: "Activities", route: "/customers/activities", description: "Track calls, emails and meetings.", order: 20 },
            { id: "segments", name: "Segments", route: "/customers/segments", description: "Group customers for sales and marketing.", order: 30 },
          ],
        },
      ],
    },

    operations: {
      title: "Operations",
      description: "Run industry operations, service delivery and daily execution.",
      groups: [
        {
          id: "restaurant",
          name: "Restaurant",
          description: "POS, kitchen, tables, menu and service operations.",
          order: 10,
          items: [
            { id: "pos", name: "POS", route: "/restaurant", description: "Open restaurant point of sale.", order: 10 },
            { id: "kitchen", name: "Kitchen", route: "/kitchen", description: "Manage kitchen production.", order: 20 },
            { id: "tables", name: "Tables", route: "/tables", description: "Manage tables and live sessions.", order: 30 },
            { id: "reservations", name: "Reservations", route: "/restaurant/reservations", description: "Manage bookings and guest flow.", order: 40 },
            { id: "menu", name: "Menu", route: "/restaurant/menu", description: "Manage menu, pricing and availability.", order: 50 },
            { id: "production", name: "Production", route: "/restaurant/production", description: "Prepare recipes, batches and production.", order: 60 },
          ],
        },
        {
          id: "hotel",
          name: "Hotel",
          description: "Front desk, rooms, housekeeping and guests.",
          order: 20,
          items: [
            { id: "front_desk", name: "Front Desk", route: "/hotel/frontdesk", description: "Manage check-in and check-out.", order: 10 },
            { id: "hotel_reservations", name: "Reservations", route: "/hotel/reservations", description: "Manage hotel bookings.", order: 20 },
            { id: "rooms", name: "Rooms", route: "/hotel/rooms", description: "Manage rooms and room status.", order: 30 },
            { id: "housekeeping", name: "Housekeeping", route: "/hotel/housekeeping", description: "Manage cleaning and room readiness.", order: 40 },
            { id: "maintenance", name: "Maintenance", route: "/hotel/maintenance", description: "Track maintenance tasks.", order: 50 },
          ],
        },
        {
          id: "construction",
          name: "Construction",
          description: "Site operations, work orders, equipment and planning.",
          order: 30,
          items: [
            { id: "site_management", name: "Site Management", route: "/construction/sites", description: "Manage active sites.", order: 10 },
            { id: "work_orders", name: "Work Orders", route: "/construction/work-orders", description: "Create and track work orders.", order: 20 },
            { id: "equipment", name: "Equipment", route: "/construction/equipment", description: "Manage equipment usage.", order: 30 },
            { id: "field_reports", name: "Field Reports", route: "/construction/reports", description: "Capture field progress.", order: 40 },
          ],
        },
        {
          id: "healthcare",
          name: "Healthcare",
          description: "Patients, appointments, clinical flow and pharmacy.",
          order: 40,
          items: [
            { id: "patients", name: "Patients", route: "/healthcare/patients", description: "Manage patient records.", order: 10 },
            { id: "appointments", name: "Appointments", route: "/healthcare/appointments", description: "Manage appointment scheduling.", order: 20 },
            { id: "clinical", name: "Clinical", route: "/healthcare/medical-records", description: "Manage clinical records.", order: 30 },
            { id: "laboratory", name: "Laboratory", route: "/healthcare/laboratory", description: "Manage lab orders and results.", order: 40 },
            { id: "pharmacy", name: "Pharmacy", route: "/healthcare/pharmacy", description: "Manage prescriptions and pharmacy operations.", order: 50 },
          ],
        },
      ],
    },

    "supply-chain": {
      title: "Supply Chain",
      description: "Manage procurement, inventory, suppliers, receiving and logistics.",
      groups: [
        {
          id: "procurement",
          name: "Procurement",
          description: "Suppliers, purchase orders and buying workflows.",
          order: 10,
          items: [
            { id: "suppliers", name: "Suppliers", route: "/procurement/suppliers", description: "Manage supplier records.", order: 10 },
            { id: "purchase_orders", name: "Purchase Orders", route: "/procurement/purchase-orders", description: "Create and manage purchase orders.", order: 20 },
            { id: "supplier_prices", name: "Supplier Prices", route: "/procurement/pricing", description: "Manage supplier prices.", order: 30 },
            { id: "purchase_requests", name: "Purchase Requests", route: "/procurement/requests", description: "Review purchase requests.", order: 40 },
          ],
        },
        {
          id: "inventory",
          name: "Inventory",
          description: "Stock, locations, transfers and counts.",
          order: 20,
          items: [
            { id: "items", name: "Items", route: "/inventory/items", description: "Manage products and stock items.", order: 10 },
            { id: "locations", name: "Locations", route: "/inventory/locations", description: "Manage stock locations.", order: 20 },
            { id: "transfers", name: "Transfers", route: "/inventory/transfers", description: "Move stock between locations.", order: 30 },
            { id: "stock_counts", name: "Stock Counts", route: "/inventory/counts", description: "Count and adjust inventory.", order: 40 },
          ],
        },
        {
          id: "receiving",
          name: "Receiving",
          description: "Goods receipts, quality and supplier fulfillment.",
          order: 30,
          items: [
            { id: "goods_receipts", name: "Goods Receipts", route: "/procurement/goods-receipts", description: "Receive purchased goods.", order: 10 },
            { id: "invoice_matching", name: "Invoice Matching", route: "/finance/invoice-matching", description: "Match invoices to purchase orders and receipts.", order: 20 },
            { id: "quality", name: "Quality", route: "/supply-chain/quality", description: "Inspect received goods.", order: 30 },
          ],
        },
      ],
    },

    finance: {
      title: "Finance",
      description: "Professional financial management for accounting firms, operators and multi-entity businesses.",
      groups: [
        {
          id: "accounting",
          name: "Accounting",
          description: "Core accounting, posting and ledger control.",
          order: 10,
          items: [
            { id: "general_ledger", name: "General Ledger", route: "/finance/ledger", description: "Review ledger activity and balances.", order: 10 },
            { id: "journals", name: "Journals", route: "/finance/journals", description: "Create and review journal entries.", order: 20 },
            { id: "trial_balance", name: "Trial Balance", route: "/finance/trial-balance", description: "Review trial balance by period.", order: 30 },
            { id: "chart_of_accounts", name: "Chart of Accounts", route: "/finance/accounting", description: "Maintain account structure.", order: 40 },
            { id: "fiscal_periods", name: "Fiscal Periods", route: "/finance/periods", description: "Manage fiscal periods and locks.", order: 50 },
            { id: "dimensions", name: "Dimensions", route: "/finance/dimensions", description: "Manage departments, cost centers and dimensions.", order: 60 },
          ],
        },
        {
          id: "order_to_cash",
          name: "Order to Cash",
          description: "Customers, invoices, payments, credit and receivables.",
          order: 20,
          items: [
            { id: "customers", name: "Customers", route: "/finance/customers", description: "Manage finance customer records.", order: 10 },
            { id: "customer_invoices", name: "Customer Invoices", route: "/finance/ar/invoices", description: "Create and review sales invoices.", order: 20 },
            { id: "accounts_receivable", name: "Accounts Receivable", route: "/finance/ar", description: "Manage AR balances and activity.", order: 30 },
            { id: "customer_payments", name: "Customer Payments", route: "/finance/ar/payments", description: "Receive and allocate customer payments.", order: 40 },
            { id: "collections", name: "Collections", route: "/finance/ar/collections", description: "Manage collections and overdue balances.", order: 50 },
            { id: "revenue_recognition", name: "Revenue Recognition", route: "/finance/revenue-recognition", description: "Recognize revenue according to rules.", order: 60 },
          ],
        },
        {
          id: "procure_to_pay",
          name: "Procure to Pay",
          description: "Vendors, purchase documents, invoice matching and payables.",
          order: 30,
          items: [
            { id: "vendors", name: "Vendors", route: "/finance/vendors", description: "Manage vendor finance records.", order: 10 },
            { id: "purchase_orders", name: "Purchase Orders", route: "/procurement/purchase-orders", description: "Review purchase commitments.", order: 20 },
            { id: "goods_receipts", name: "Goods Receipts", route: "/procurement/goods-receipts", description: "Review received goods.", order: 30 },
            { id: "invoice_matching", name: "Invoice Matching", route: "/finance/invoice-matching", description: "Match invoices, POs and receipts.", order: 40 },
            { id: "accounts_payable", name: "Accounts Payable", route: "/finance/ap", description: "Manage payables and vendor balances.", order: 50 },
            { id: "payment_runs", name: "Payment Runs", route: "/finance/ap/payments", description: "Prepare and execute vendor payments.", order: 60 },
          ],
        },
        {
          id: "treasury",
          name: "Treasury",
          description: "Banking, cash, reconciliation and liquidity.",
          order: 40,
          items: [
            { id: "bank_accounts", name: "Bank Accounts", route: "/finance/treasury/bank-accounts", description: "Manage bank accounts.", order: 10 },
            { id: "cash_flow", name: "Cash Flow", route: "/finance/treasury/cash-flow", description: "Monitor cash inflows and outflows.", order: 20 },
            { id: "bank_reconciliation", name: "Bank Reconciliation", route: "/finance/treasury/reconciliation", description: "Reconcile bank statements.", order: 30 },
            { id: "payments", name: "Payments", route: "/finance/treasury/payments", description: "Manage outgoing and incoming payments.", order: 40 },
          ],
        },
        {
          id: "compliance",
          name: "Compliance",
          description: "Tax, assets, audit, close and statutory control.",
          order: 50,
          items: [
            { id: "tax", name: "Tax", route: "/finance/tax", description: "Manage VAT, tax codes and filings.", order: 10 },
            { id: "fixed_assets", name: "Fixed Assets", route: "/finance/assets", description: "Manage fixed assets.", order: 20 },
            { id: "depreciation", name: "Depreciation", route: "/finance/assets/depreciation", description: "Run and review depreciation.", order: 30 },
            { id: "audit_trail", name: "Audit Trail", route: "/finance/audit", description: "Review finance audit history.", order: 40 },
            { id: "period_close", name: "Period Close", route: "/finance/close", description: "Run month-end and year-end close.", order: 50 },
            { id: "year_end", name: "Year End", route: "/finance/year-end", description: "Prepare year-end processing.", order: 60 },
          ],
        },
        {
          id: "management",
          name: "Management",
          description: "Budgets, forecasts, KPIs and executive control.",
          order: 60,
          items: [
            { id: "budgeting", name: "Budgeting", route: "/finance/budgeting", description: "Manage budgets.", order: 10 },
            { id: "forecasting", name: "Forecasting", route: "/finance/forecasting", description: "Prepare forecasts.", order: 20 },
            { id: "finance_kpis", name: "KPIs", route: "/finance/kpis", description: "Review finance KPIs.", order: 30 },
            { id: "executive_dashboard", name: "Executive Dashboard", route: "/finance/reports", description: "Open finance executive reporting.", order: 40 },
          ],
        },
        {
          id: "enterprise",
          name: "Enterprise",
          description: "Legal entities, cost centers, intercompany and consolidation.",
          order: 70,
          items: [
            { id: "legal_entities", name: "Legal Entities", route: "/finance/entities", description: "Manage legal entities.", order: 10 },
            { id: "cost_centers", name: "Cost Centers", route: "/finance/cost-centers", description: "Manage cost centers.", order: 20 },
            { id: "intercompany", name: "Intercompany", route: "/finance/intercompany", description: "Manage intercompany activity.", order: 30 },
            { id: "consolidation", name: "Consolidation", route: "/finance/consolidation", description: "Consolidate financial results.", order: 40 },
          ],
        },
        {
          id: "reporting",
          name: "Reporting",
          description: "Statements, management reports and analytics.",
          order: 80,
          items: [
            { id: "financial_statements", name: "Financial Statements", route: "/finance/statements", description: "Balance sheet, P&L and cash flow.", order: 10 },
            { id: "management_reports", name: "Management Reports", route: "/finance/management-reports", description: "Operational management reports.", order: 20 },
            { id: "finance_analytics", name: "Analytics", route: "/finance/reports", description: "Analyze finance performance.", order: 30 },
          ],
        },
      ],
    },

    people: {
      title: "People",
      description: "Manage employees, scheduling, attendance, payroll and performance.",
      groups: [
        {
          id: "workforce",
          name: "Workforce",
          description: "Employees, roles and staff records.",
          order: 10,
          items: [
            { id: "employees", name: "Employees", route: "/workforce/employees", description: "Manage employee records.", order: 10 },
            { id: "attendance", name: "Attendance", route: "/staff/attendance", description: "Track check-in and check-out.", order: 20 },
            { id: "scheduling", name: "Scheduling", route: "/workforce/scheduling", description: "Plan shifts and schedules.", order: 30 },
            { id: "performance", name: "Performance", route: "/staff/performance", description: "Review staff performance.", order: 40 },
          ],
        },
        {
          id: "payroll",
          name: "Payroll",
          description: "Salary, service charge, payouts and approvals.",
          order: 20,
          items: [
            { id: "payroll_runs", name: "Payroll Runs", route: "/workforce/payroll", description: "Prepare payroll.", order: 10 },
            { id: "payout", name: "Payout", route: "/payout", description: "Review staff payouts.", order: 20 },
            { id: "earnings", name: "Earnings", route: "/staff/earnings", description: "Review staff earnings.", order: 30 },
          ],
        },
      ],
    },

    projects: {
      title: "Projects",
      description: "Manage projects, plans, resources, tasks, time and cost.",
      groups: [
        {
          id: "project_control",
          name: "Project Control",
          description: "Projects, milestones, tasks and progress.",
          order: 10,
          items: [
            { id: "projects", name: "Projects", route: "/projects", description: "Open project list.", order: 10 },
            { id: "planning", name: "Planning", route: "/projects/planning", description: "Plan project schedules.", order: 20 },
            { id: "tasks", name: "Tasks", route: "/projects/tasks", description: "Manage project tasks.", order: 30 },
            { id: "time", name: "Time", route: "/projects/time", description: "Track project time.", order: 40 },
            { id: "costs", name: "Costs", route: "/projects/costs", description: "Track project costs.", order: 50 },
          ],
        },
      ],
    },

    documents: {
      title: "Documents",
      description: "Manage files, OCR, contracts, templates, invoices, photos and knowledge.",
      groups: [
        {
          id: "document_management",
          name: "Document Management",
          description: "Enterprise files, forms and records.",
          order: 10,
          items: [
            { id: "files", name: "Files", route: "/documents", description: "Manage files and folders.", order: 10 },
            { id: "ocr", name: "OCR", route: "/documents/ocr", description: "Extract data from documents.", order: 20 },
            { id: "contracts", name: "Contracts", route: "/documents/contracts", description: "Manage contracts.", order: 30 },
            { id: "templates", name: "Templates", route: "/documents/templates", description: "Manage templates.", order: 40 },
            { id: "media_library", name: "Media Library", route: "/documents/media", description: "Manage images and videos.", order: 50 },
          ],
        },
      ],
    },

    analytics: {
      title: "Analytics",
      description: "Dashboards, KPIs, reports, BI and forecasting.",
      groups: [
        {
          id: "business_intelligence",
          name: "Business Intelligence",
          description: "Analyze performance across the business.",
          order: 10,
          items: [
            { id: "dashboards", name: "Dashboards", route: "/analytics", description: "Open business dashboards.", order: 10 },
            { id: "reports", name: "Reports", route: "/analytics/reports", description: "Run reports.", order: 20 },
            { id: "kpis", name: "KPIs", route: "/analytics/kpis", description: "Review key performance indicators.", order: 30 },
            { id: "forecasts", name: "Forecasts", route: "/analytics/forecasts", description: "Review forecasts.", order: 40 },
          ],
        },
      ],
    },

    ai: {
      title: "AI",
      description: "Assistants, agents, automations, recommendations and knowledge.",
      groups: [
        {
          id: "assistants",
          name: "Assistants",
          description: "AI copilots for each business domain.",
          order: 10,
          items: [
            { id: "ai_center", name: "AI Center", route: "/intelligence", description: "Open Avantiqo AI.", order: 10 },
            { id: "finance_ai", name: "Finance AI", route: "/intelligence/finance", description: "Analyze finance and accounting.", order: 20 },
            { id: "operations_ai", name: "Operations AI", route: "/intelligence/operations", description: "Analyze operations and service.", order: 30 },
            { id: "marketing_ai", name: "Marketing AI", route: "/intelligence/marketing", description: "Generate campaigns and insights.", order: 40 },
          ],
        },
        {
          id: "automation",
          name: "Automation",
          description: "Agents, workflows and scheduled tasks.",
          order: 20,
          items: [
            { id: "agents", name: "Agents", route: "/intelligence/agents", description: "Manage AI agents.", order: 10 },
            { id: "workflows", name: "Workflows", route: "/intelligence/workflows", description: "Automate business workflows.", order: 20 },
            { id: "knowledge", name: "Knowledge", route: "/intelligence/knowledge", description: "Manage AI knowledge.", order: 30 },
          ],
        },
      ],
    },

    administration: {
      title: "Administration",
      description: "Manage organizations, security, permissions, integrations and packages.",
      groups: [
        {
          id: "platform",
          name: "Platform",
          description: "Core platform settings.",
          order: 10,
          items: [
            { id: "organizations", name: "Organizations", route: "/settings/organizations", description: "Manage organizations and companies.", order: 10 },
            { id: "users", name: "Users", route: "/settings/users", description: "Manage users.", order: 20 },
            { id: "roles", name: "Roles & Permissions", route: "/settings/roles", description: "Manage roles and permissions.", order: 30 },
            { id: "integrations", name: "Integrations", route: "/settings/integrations", description: "Connect external systems.", order: 40 },
            { id: "packages", name: "Packages", route: "/settings/packages", description: "Install and manage business packages.", order: 50 },
          ],
        },
      ],
    },
  },
};

function normalizeWorkspaceId(workspaceId) {
  if (!workspaceId) return "";
  const id = String(workspaceId).toLowerCase();

  if (id === "dashboard") return "home";
  if (id === "procurement" || id === "inventory") return "supply-chain";
  if (id === "workforce" || id === "hr") return "people";
  if (id === "intelligence") return "ai";
  if (id === "settings" || id === "admin") return "administration";

  return id;
}

export function getErpDomains() {
  return [...ERP_REGISTRY.domains].sort((a, b) => a.order - b.order);
}

export function getErpPackages(activeIds = null) {
  const active =
    activeIds && activeIds.size > 0
      ? ERP_REGISTRY.packages.filter((item) => activeIds.has(item.id))
      : ERP_REGISTRY.packages;

  return [...active].sort((a, b) => a.order - b.order);
}

export function getErpSolutions(activeIds = null) {
  return getErpPackages(activeIds);
}

export function getWorkspaceMeta(workspaceId) {
  const id = normalizeWorkspaceId(workspaceId);
  return ERP_REGISTRY.workspaces[id] || null;
}

export function getWorkspaceGroups(workspaceId) {
  const workspace = getWorkspaceMeta(workspaceId);

  if (!workspace) return [];

  return [...(workspace.groups || [])]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      ...group,
      items: [...(group.items || [])].sort((a, b) => a.order - b.order),
    }));
}

export function getWorkspaceItems(workspaceId) {
  return getWorkspaceGroups(workspaceId).flatMap((group) =>
    (group.items || []).map((item) => ({
      ...item,
      groupId: group.id,
      groupName: group.name,
    }))
  );
}

export function getCapabilitySearchIndex() {
  return Object.entries(ERP_REGISTRY.workspaces).flatMap(
    ([workspaceId, workspace]) =>
      (workspace.groups || []).flatMap((group) =>
        (group.items || []).map((item) => ({
          ...item,
          workspaceId,
          workspaceName: workspace.title,
          groupId: group.id,
          groupName: group.name,
          searchText: [
            workspace.title,
            group.name,
            item.name,
            item.description,
            ...(item.tags || []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        }))
      )
  );
}
