export const ERP_REGISTRY = {
  domains: [
    {
      id: "home",
      name: "Home",
      moduleId: null,
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
      id: "operations",
      name: "Operations",
      route: "/operations",
      type: "core",
      order: 30,
      description: "Industry operations, service delivery and daily execution.",
    },
    {
      id: "supply-chain",
      name: "Supply Chain",
      route: "/supply-chain",
      type: "core",
      order: 40,
      description: "Inventory, procurement, suppliers, receiving and logistics.",
    },
    {
      id: "finance",
      name: "Finance",
      route: "/finance",
      type: "core",
      order: 50,
      description: "Accounting, treasury, tax, close, controls and reporting.",
    },
    {
      id: "people",
      name: "People",
      route: "/people",
      type: "core",
      order: 60,
      description: "Employees, scheduling, payroll, attendance and performance.",
    },
    {
      id: "projects",
      name: "Projects",
      route: "/projects",
      type: "core",
      order: 70,
      description: "Projects, tasks, resources, planning, time and costs.",
    },
    {
      id: "documents",
      name: "Documents",
      route: "/documents",
      type: "core",
      order: 80,
      description: "Files, OCR, contracts, receipts, media and knowledge.",
    },
    {
      id: "analytics",
      name: "Analytics",
      route: "/analytics",
      type: "core",
      order: 90,
      description: "Dashboards, KPIs, reports, BI and forecasts.",
    },
    {
      id: "ai",
      name: "AI",
      route: "/intelligence",
      type: "core",
      order: 100,
      description: "Assistants, agents, automations and recommendations.",
    },
    {
      id: "administration",
      name: "Administration",
      route: "/settings",
      type: "core",
      order: 110,
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
      description: "Manage sales, customers, marketing, reviews and revenue activity.",
      groups: [
        {
          id: "sales",
          name: "Sales",
          description: "Orders, quotes, contracts, pricing and pipeline execution.",
          order: 10,
          items: [
            { id: "sales_orders", name: "Sales Orders", route: "/commercial/sales/orders", description: "Create and manage customer orders.", order: 10, status: "planned" },
            { id: "quotes", name: "Quotes", route: "/commercial/sales/quotes", description: "Prepare and track customer quotes.", order: 20, status: "planned" },
            { id: "contracts", name: "Contracts", route: "/commercial/sales/contracts", description: "Manage customer contracts and commercial terms.", order: 30, status: "planned" },
            { id: "pricing", name: "Pricing", route: "/commercial/sales/pricing", description: "Maintain prices, discounts and commercial rules.", order: 40, status: "planned" },
            { id: "opportunities", name: "Opportunities", route: "/commercial/sales/opportunities", description: "Manage pipeline and opportunities.", order: 50, status: "planned" },
          ],
        },
        {
          id: "customer_management",
          name: "Customer Management",
          description: "Customer records, relationships, timeline and communication.",
          order: 20,
          items: [
            { id: "customers", name: "Customers", route: "/commercial/customers", description: "Manage customer records.", order: 10, status: "active" },
            { id: "accounts", name: "Accounts", route: "/commercial/customers/accounts", description: "Manage customer accounts.", order: 20, status: "planned" },
            { id: "contacts", name: "Contacts", route: "/commercial/customers/contacts", description: "Manage contacts and profiles.", order: 30, status: "planned" },
            { id: "leads", name: "Leads", route: "/commercial/customers/leads", description: "Track leads and opportunities.", order: 40, status: "planned" },
            { id: "loyalty", name: "Loyalty", route: "/commercial/customers/loyalty", description: "Manage loyalty programs.", order: 50, status: "planned" },
            { id: "cases", name: "Cases", route: "/commercial/customers/cases", description: "Manage customer support cases.", order: 60, status: "planned" },
          ],
        },
        {
          id: "marketing",
          name: "Marketing",
          description: "Campaigns, assets, publishing, queue and growth execution.",
          order: 30,
          items: [
            { id: "campaigns", name: "Campaigns", route: "/commercial/marketing", description: "Plan and run marketing campaigns.", order: 10, status: "active" },
            { id: "marketing_dashboard", name: "Dashboard", route: "/commercial/marketing/dashboard", description: "Review marketing performance.", order: 20, status: "active" },
            { id: "design_studio", name: "Design Studio", route: "/commercial/marketing/design", description: "Create brand and campaign assets.", order: 30, status: "active" },
            { id: "assets", name: "Assets", route: "/commercial/marketing/assets", description: "Manage marketing assets.", order: 40, status: "active" },
            { id: "social_publishing", name: "Social Publishing", route: "/commercial/marketing/social", description: "Publish to social channels.", order: 50, status: "active" },
            { id: "queue", name: "Queue", route: "/commercial/marketing/queue", description: "Manage campaign queue.", order: 60, status: "active" },
            { id: "operations", name: "Operations", route: "/commercial/marketing/operations", description: "Run marketing operations.", order: 70, status: "active" },
          ],
        },
        {
          id: "reviews",
          name: "Reviews",
          description: "Reviews, reputation, leaderboards and public presence.",
          order: 40,
          items: [
            { id: "reviews", name: "Reviews", route: "/commercial/reviews", description: "Manage reviews and reputation.", order: 10, status: "planned" },
            { id: "review_leaderboard", name: "Leaderboard", route: "/commercial/reviews/leaderboard", description: "Review leaderboard and review performance.", order: 20, status: "planned" },
          ],
        },
        {
          id: "revenue",
          name: "Revenue",
          description: "Customer invoices, payments, billing and commercial revenue.",
          order: 50,
          items: [
            { id: "billing", name: "Billing", route: "/commercial/revenue", description: "Manage billing.", order: 10, status: "active" },
            { id: "customer_invoices", name: "Customer Invoices", route: "/finance/ar/invoices", description: "Create and review customer invoices.", order: 20, status: "active" },
            { id: "customer_payments", name: "Customer Payments", route: "/finance/ar/payments", description: "Receive and allocate customer payments.", order: 30, status: "active" },
          ],
        },
        {
          id: "analytics",
          name: "Analytics",
          description: "Sales, customer and marketing analytics.",
          order: 60,
          items: [
            { id: "sales_analytics", name: "Sales Analytics", route: "/analytics/sales", description: "Analyze commercial sales.", order: 10, status: "active" },
            { id: "marketing_analytics", name: "Marketing Analytics", route: "/commercial/marketing/dashboard", description: "Analyze marketing performance.", order: 20, status: "active" },
          ],
        },
      ],
    },

    
    operations: {
      title: "Operations",
      description: "Shared operational work centers across all industries.",
      groups: [
        {
          id: "point_of_sale",
          name: "Point of Sale",
          order: 10,
          items: [
            { id:"waiter", route:"/operations/pos/waiter", name:"Waiter", order:10 },
            { id:"orders", route:"/operations/pos/orders", name:"Orders", order:20 },
            { id:"payments", route:"/operations/pos/payments", name:"Payments", order:30 },
            { id:"receipts", route:"/operations/pos/receipts", name:"Receipts", order:40 },
            { id:"shifts", route:"/operations/pos/shifts", name:"Shifts", order:50 },
            { id:"modifiers", route:"/operations/pos/modifiers", name:"Modifiers", order:60 },
            { id:"history", route:"/operations/pos/history", name:"History", order:70 },
            { id:"realtime", route:"/operations/pos/realtime", name:"Realtime", order:80 }
          ]
        },
        {
          id:"table_management",
          name:"Table Management",
          order:20,
          items:[
            { id:"tables", route:"/operations/tables", name:"Tables", order:10 },
            { id:"reservations", route:"/operations/reservations", name:"Reservations", order:20 },
            { id:"seating", route:"/operations/seating", name:"Seating", order:30 }
          ]
        },
        {
          id:"kitchen_operations",
          name:"Kitchen Operations",
          order:30,
          items:[
            { id:"kitchen", route:"/operations/kitchen", name:"Kitchen", order:10 },
            { id:"expo", route:"/operations/kitchen/expo", name:"Expo", order:20 },
            { id:"kds", route:"/operations/kitchen/kds", name:"KDS", order:30 },
            { id:"stations", route:"/operations/kitchen/stations", name:"Stations", order:40 }
          ]
        },
        {
          id:"production",
          name:"Production",
          order:40,
          items:[
            { id:"recipes", route:"/operations/production/recipes", name:"Recipes", order:10 },
            { id:"recipe_components", route:"/operations/production/recipe-components", name:"Recipe Components", order:20 },
            { id:"batches", route:"/operations/production/batches", name:"Batches", order:30 },
            { id:"prepared", route:"/operations/production/prepared", name:"Prepared Items", order:40 },
            { id:"costing", route:"/operations/production/costing", name:"Costing", order:50 },
            { id:"usage", route:"/operations/production/usage", name:"Usage", order:60 },
            { id:"waste", route:"/operations/production/waste", name:"Waste", order:70 },
            { id:"performance", route:"/operations/production/performance", name:"Performance", order:80 },
            { id:"approval", route:"/operations/production/approval", name:"Approval", order:90 },
            { id:"logs", route:"/operations/production/logs", name:"Logs", order:100 }
          ]
        },
        {
          id:"service",
          name:"Service Operations",
          order:50,
          items:[]
        },
        {
          id:"dispatch",
          name:"Dispatch",
          order:60,
          items:[]
        },
        {
          id:"scheduling",
          name:"Scheduling",
          order:70,
          items:[]
        },
        {
          id:"monitoring",
          name:"Monitoring",
          order:80,
          items:[]
        }
      ]
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
        {
          id: "channels",
          name: "Channels",
          description: "Provision and manage every customer interaction channel.",
          order: 20,
          items: [
            { id: "website_builder", name: "Website Builder", route: "/settings/channels/website-builder", order: 10 },
            { id: "external_websites", name: "External Websites", route: "/settings/channels/external-websites", order: 20 },
            { id: "customer_portal", name: "Customer Portal", route: "/settings/channels/customer-portal", order: 30 },
            { id: "supplier_portal", name: "Supplier Portal", route: "/settings/channels/supplier-portal", order: 40 },
            { id: "employee_portal", name: "Employee Portal", route: "/settings/channels/employee-portal", order: 50 },
            { id: "public_portal", name: "Public Portal", route: "/settings/channels/public-portal", order: 60 },
            { id: "widgets", name: "Embedded Widgets", route: "/settings/channels/widgets", order: 70 },
            { id: "public_api", name: "Public API", route: "/settings/channels/public-api", order: 80 },
            { id: "webhooks", name: "Webhooks", route: "/settings/channels/webhooks", order: 90 },
            { id: "oauth", name: "OAuth / SSO", route: "/settings/channels/oauth", order: 100 },
            { id: "mobile_apps", name: "Mobile Apps", route: "/settings/channels/mobile", order: 110 },
            { id: "ai_agents", name: "AI Agents", route: "/settings/channels/ai", order: 120 }
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
  if (id === "customers" || id === "crm") return "commercial";
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
