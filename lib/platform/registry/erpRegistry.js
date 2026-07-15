import { buildWorkspaceAction } from "@/lib/platform/actions/WorkspaceActionCatalog";
import BusinessLocationsWorkspace from "@/lib/platform/administration/business-locations/workspaces/BusinessLocationsWorkspace";
import DepartmentsWorkspace from "@/lib/platform/administration/departments/workspaces/DepartmentsWorkspace";
import TeamsWorkspace from "@/lib/platform/administration/teams/workspaces/TeamsWorkspace";
import BusinessUnitsWorkspace from "@/lib/platform/administration/business-units/workspaces/BusinessUnitsWorkspace";
import buildCommercialRuntime from "@/lib/commercial/runtime/CommercialRuntime";
import buildOperationsRuntime from "@/lib/operations/runtime/OperationsRuntime";

export const ERP_REGISTRY = {
  platform: {
    brand: {
      name: "Avantiqo",
      subtitle: "Synthetic Intelligence OS",
    },
    header: [
      { id: "search", name: "Search", type: "search", icon: "Search", route: "/search", order: 10 },
      { id: "network", name: "Network", type: "link", icon: "Globe2", route: "/network", order: 20 },
      { id: "services", name: "Services", type: "link", icon: "CreditCard", route: "/services", order: 25 },
      { id: "ai", name: "AI", type: "link", icon: "Sparkles", route: "/intelligence", order: 30 },
      { id: "notifications", name: "Notifications", type: "button", icon: "Bell", route: "/notifications", order: 40 },
      { id: "user", name: "User", type: "user", icon: "UserCircle", route: "/profile", order: 50 },
    ],
  },

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
      runtime: buildCommercialRuntime,
    },
    {
      id: "operations",
      name: "Operations",
      route: "/operations",
      type: "core",
      order: 30,
      description: "Industry operations, service delivery and daily execution.",
      runtime: buildOperationsRuntime,
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
      id: "compliance",
      name: "Compliance",
      route: "/compliance",
      type: "core",
      order: 80,
      description: "Assets, obligations, licenses, insurance, renewals, compliance and AI monitoring.",
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
      id: "services",
      name: "Services",
      route: "/services",
      type: "core",
      order: 110,
      description: "Platform integrations, wallet, usage, billing and service operations.",
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

  solutions: [
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
            { 
  id: "customers",
  name: "Customers",
  route: "/commercial/customers",
  description: "Manage customer records.",
  order: 10,
  status: "active",
  type:"business-workspace",
  document:"Customer",

  create:{
    enabled:true,
    type:"document",
    engine:"create",
    id:"customer",
    capability:"customer",
    action:"createCustomer",
    form:"customer",
    label:"+ Customer",
    title:"Customer"
  },

  runtime:{
    renderer:"MasterDataRuntimeWorkCenter",
    listApi:"/api/finance/customers"
  },

  data:{
    capability:"customer",
    repository:"CustomerRepository",
    applicationService:"createCustomer"
  },

  ui:{
    api:"/api/finance/customers",
    rowsKey:"customers",
    search:[
      "customer_name",
      "customer_email",
      "customer_phone",
      "tax_id"
    ]
  },

  actions:[
    {
      type:"capability",
      label:"Create Invoice",
      capability:"accounts_receivable",
      action:"CreateCustomerInvoice",
      form:"customer-invoice"
    },
    {
      type:"capability",
      label:"Create Payment",
      capability:"accounts_receivable",
      action:"postCustomerPayment"
    },
    {
      type:"capability",
      label:"View Statement",
      capability:"finance.customer_statement.view"
    },
    {
      type:"edit",
      label:"Edit Customer"
    },
    {
      type:"archive",
      label:"Archive Customer"
    }
  ]
},
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
            {
              id: "design_studio",
              name: "Design Studio",
              route: "/commercial/design",
              description: "Creative operating system for missions, briefs, research, strategy, concepts, storyboards, scenes, timeline, rendering and publishing.",
              order: 30,
              status: "active",
              type: "operational-workspace",
              layout: "studio",
              renderer: "CreativeWorkspaceRenderer",
              runtime: "resolveCreativeStudioRuntime",
              document: "CreativeMission",
              defaultWorkspace: "mission_control",
              widgets: [
                "mission_overview",
                "mission_lifecycle",
                "project_pipeline",
                "cost_control",
                "production_queue",
                "production_monitor",
                "ai_director",
                "recent_assets",
                "render_queue",
                "publishing_queue"
              ],
              commands: [
                { id: "create_mission", label: "Create Mission", action: "create", api: "/api/creative/missions" },
                { id: "start_mission", label: "Start Mission", action: "start", api: "/api/creative/missions" },
                { id: "create_project", label: "New Project", capability: "creative.projects.create" },
                { id: "open_assets", label: "Assets", route: "assets" },
                { id: "estimate_cost", label: "Estimate Cost", capability: "creative.cost.estimate" }
              ],
              engines: [
                "mission",
                "director",
                "research",
                "planning",
                "actor",
                "asset",
                "voice",
                "music",
                "scene",
                "shot",
                "timeline",
                "render",
                "qa",
                "publishing",
                "learning"
              ],

              workspaces: [
                {
                  id: "mission",
                  title: "Mission",
                  engine: "mission",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: false,
                  },
                },
                {
                  id: "brief",
                  title: "Brief",
                  engine: "planning",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: false,
                  },
                },
                {
                  id: "research",
                  title: "Research",
                  engine: "research",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: false,
                  },
                },
                {
                  id: "strategy",
                  title: "Strategy",
                  engine: "planning",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: false,
                  },
                },
                {
                  id: "director",
                  title: "AI Director",
                  engine: "director",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: true,
                  },
                },
                {
                  id: "concept",
                  title: "Concept",
                  engine: "planning",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: true,
                  },
                },
                {
                  id: "storyboard",
                  title: "Storyboard",
                  engine: "scene",
                  renderer: "dynamic",
                  layout: {
                    dock: true,
                    inspector: true,
                  },
                },
                {
                  id: "production",
                  title: "Production",
                  engine: "scene",
                  renderer: "dynamic",
                  layout: {
                    dock: true,
                    inspector: true,
                  },
                },
                {
                  id: "assets",
                  title: "Assets",
                  engine: "asset",
                  renderer: "dynamic",
                  layout: {
                    dock: true,
                    inspector: true,
                  },
                },
                {
                  id: "timeline",
                  title: "Timeline",
                  engine: "timeline",
                  renderer: "dynamic",
                  layout: {
                    dock: true,
                    inspector: true,
                  },
                },
                {
                  id: "render",
                  title: "Rendering",
                  engine: "render",
                  renderer: "dynamic",
                  layout: {
                    dock: true,
                    inspector: true,
                  },
                },
                {
                  id: "publishing",
                  title: "Publishing",
                  engine: "publishing",
                  renderer: "dynamic",
                  layout: {
                    dock: true,
                    inspector: true,
                  },
                },
                {
                  id: "documents",
                  title: "Documents",
                  engine: "qa",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: false,
                  },
                },
                {
                  id: "learning",
                  title: "Learning",
                  engine: "learning",
                  renderer: "dynamic",
                  layout: {
                    dock: false,
                    inspector: false,
                  },
                }
              ]
            },
            { id: "assets", name: "Assets", route: "/commercial/marketing/assets", description: "Manage marketing assets.", order: 40, status: "active" },
            { id: "social_publishing", name: "Social Publishing", route: "/commercial/marketing/social", description: "Publish to social channels.", order: 50, status: "active" },
            { id: "queue", name: "Queue", route: "/commercial/marketing/queue", description: "Manage campaign queue.", order: 60, status: "active" },
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
            { id:"modifiers", route:"/operations/pos/modifiers", name:"Configuration Options", order:60 },
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
            { id:"recipes", route:"/supply-chain/production/recipes", name:"Recipes", order:10 },
            { id:"recipe_components", route:"/supply-chain/production/recipe-components", name:"Recipe Components", order:20 },
            { id:"batches", route:"/supply-chain/production/batches", name:"Batches", order:30 },
            { id:"prepared", route:"/supply-chain/production/prepared", name:"Prepared Items", order:40 },
            { id:"costing", route:"/supply-chain/production/costing", name:"Costing", order:50 },
            { id:"usage", route:"/supply-chain/production/usage", name:"Usage", order:60 },
            { id:"waste", route:"/supply-chain/production/waste", name:"Waste", order:70 },
            { id:"performance", route:"/supply-chain/production/performance", name:"Performance", order:80 },
            { id:"approval", route:"/supply-chain/production/approval", name:"Approval", order:90 },
            { id:"logs", route:"/supply-chain/production/logs", name:"Logs", order:100 }
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
      description: "Manage procurement, inventory, receiving and warehouse operations.",
      groups: [
        {
          id: "procurement",
          name: "Procurement",
          description: "Source suppliers and manage purchasing.",
          order: 10,
          items: [
            {
              id: "suppliers",
              name: "Suppliers",
              route: "/procurement/suppliers",
              description: "Manage supplier master data.",
              order: 10,
              type: "business-workspace",
              document: "Supplier",
              create:{
enabled:true,
  type: "document",
                  id: "vendor-master",
                  label: "+ Supplier",
                  title: "Supplier"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/procurement/vendors/list",
                rowsKey: "vendors",
                
                search: [
                  "display_name",
                  "legal_name",
                  "vendor_code",
                  "email",
                  "phone",
                  "tax_id"
                ],
                name: r =>
                  r.display_name ||
                  r.legal_name ||
                  "Unnamed Supplier",
                subtitle: r => [
                  r.vendor_code || "-",
                  r.email || "-",
                  r.phone || "-"
                ]
              },
              actions: [
                {
                  type: "section",
                  label: "Procurement"
                },
                {
                  label: "Purchase Orders",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/procurement/purchase-orders?vendorId=${row.id}`
                },
                {
                  label: "Purchase Requests",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/procurement/requests?vendorId=${row.id}`
                },
                {
                  label: "Goods Receipts",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/procurement/goods-receipts?vendorId=${row.id}`
                },
                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "Edit Supplier",
                  type: "select"
                },
                {
                  label: "Archive Supplier",
                  danger: true
                }
              ]
            },
            {
              id: "supplier_prices",
              name: "Supplier Prices",
              route: "/procurement/pricing",
              order: 20,
              type: "business-workspace",
              document: "SupplierPrice",

              create:{
                enabled:true,
                type:"document",
                id:"supplier-price",
                label:"+ Supplier Price",
                title:"Supplier Price"
              },

              ui:{
                api:"/api/procurement/suppliers",
                rowsKey:"supplier_prices",

                search:[
                  "supplier",
                  "item",
                  "price"
                ],

                name:r =>
                  r.item_name ||
                  r.name ||
                  "Supplier Price",

                subtitle:r => [
                  r.price || "-",
                  r.minimum_order_quantity || "-"
                ],

                rowMenu:[
                  { id:"open", type:"open" },
                  { id:"edit", type:"edit" },
                  { id:"history", type:"history" },
                  { id:"delete", type:"delete" }
                ]
              },

              actions:[
                {
                  type:"section",
                  label:"Supplier Pricing"
                },
                {
                  label:"View Supplier",
                  type:"select"
                }
              ]
            },
            {
              id: "purchase_requests",
              name: "Purchase Requests",
              route: "/procurement/requests",
              description: "Create and approve purchase requests.",
              order: 30,
              type: "business-workspace",
              document: "PurchaseRequest",
              create:{
enabled:true,
  type: "document",
                  id: "purchase_request",
                  label: "+ Purchase Request",
                  title: "Purchase Request"
},
ui:{
topMenu:[
                { id: "new", type: "create" },

                {
                  id:"preview",
                  label:"Preview",
                  type:"preview",
                  engine:"preview",
                  title:"Invoice Preview"
                },

                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/procurement/purchase-requests/list",
                rowsKey: "purchaseRequests",
                
                search: [
                  "request_number",
                  "requester",
                  "department",
                  "status"
                ],
                name: r =>
                  r.request_number ||
                  "Purchase Request",
                subtitle: r => [
                  r.requester || "-",
                  r.status || "-"
                ]
              },
              actions: [
                {
                  type: "section",
                  label: "Procurement"
                },
                {
                  label: "Convert to RFQ",
                  type: "select"
                },
                {
                  label: "Create Purchase Order",
                  type: "select"
                },
                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "Edit Request",
                  type: "select"
                },
                {
                  label: "Cancel Request",
                  danger: true
                }
              ]
            },
            { id: "rfqs", name: "RFQs", route: "/procurement/rfqs", order: 40 },
            { id: "purchase_orders", name: "Purchase Orders", route: "/procurement/purchase-orders", order: 50 },
            { id: "contracts", name: "Contracts", route: "/procurement/contracts", order: 60 },
            { id: "vendor_performance", name: "Vendor Performance", route: "/procurement/vendor-performance", order: 70 },
            { id: "spend_analysis", name: "Spend Analysis", route: "/procurement/spend-analysis", order: 80 }
          ]
        },
        {
          id: "receiving",
          name: "Receiving",
          description: "Receive, inspect and put away inventory.",
          order: 20,
          items: [
            { id: "goods_receipts", name: "Goods Receipts", route: "/procurement/goods-receipts", order: 10 },
            { id: "quality_inspection", name: "Quality Inspection", route: "/receiving/quality", order: 30 },
            { id: "invoice_matching", name: "Invoice Matching", route: "/finance/invoice-matching", order: 40 },
            { id: "returns_to_vendor", name: "Returns to Vendor", route: "/receiving/vendor-returns", order: 50 },
            { id: "receiving_dashboard", name: "Receiving Dashboard", route: "/receiving/dashboard", order: 60 }
          ]
        },
        {
          id: "inventory",
          name: "Inventory",
          description: "Inventory master data, operations, valuation and planning.",
          order: 30,
          items: [
            {
              id: "items",
              name: "Items",
              route: "/inventory/items",
              order: 10,
              type: "business-workspace",
              document: "InventoryItem",
              create:{
enabled:true,
  type: "document",
                  id: "item",
                  label: "+ Item",
                  title: "Item"
},
ui:{
topMenu:[
                { id: "new", type: "create" },

                {
                  id:"preview",
                  label:"Preview",
                  type:"preview",
                  engine:"preview",
                  title:"Invoice Preview"
                },

                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/inventory/items",
                rowsKey: "items",
                
                search: [
                  "name",
                  "sku",
                  "category",
                  "status"
                ],
                name: r =>
                  r.name ||
                  r.item_name ||
                  "Unnamed Item",
                subtitle: r => [
                  r.sku || "-",
                  r.category || "-"
                ]
              },
              actions: [
                {
                  type: "section",
                  label: "Operations"
                },
                {
                  label: "Stock Movements",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/movements?itemId=${row.id}`
                },
                {
                  label: "Adjust Stock",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/adjustments?itemId=${row.id}`
                },
                {
                  label: "Transfers",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/transfers?itemId=${row.id}`
                },
                {
                  type: "section",
                  label: "Planning"
                },
                {
                  label: "Replenishment",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/replenishment?itemId=${row.id}`
                },
                {
                  label: "Purchase Suggestions",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/purchase-suggestions?itemId=${row.id}`
                },
                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "Edit Item",
                  type: "select"
                },
                {
                  label: "Archive Item",
                  danger: true
                }
              ]
            },
            {
              id: "stock_position",
              name: "Inventory Position",
              route: "/inventory/stock-position",
              order: 15,
              type: "business-workspace",
              document: "InventoryPosition",

              actions: [
                {
                  type: "section",
                  label: "Inventory"
                },
                {
                  label: "View Movements",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/movements?itemId=${row.item_id}`
                },
                {
                  label: "View Ledger",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/stock-ledger?itemId=${row.item_id}`
                },
              ],

              ui: {

                kpis:[
                  {
                    label:"Total Quantity",
                    key:"metrics.totalQuantity",
                  },
                  {
                    label:"Items",
                    key:"metrics.itemCount",
                  },
                  {
                    label:"Locations",
                    key:"metrics.locationCount",
                  },
                ],

                api:
                  "/api/inventory/stock-position",

                  rowsKey:
                    "stock",

                  search:[
                    "item",
                    "warehouse",
                    "location",
                  ],

                  name:
                    r =>
                      r.item ||
                      "Stock Position",

                  subtitle:
                    r => [
                      r.warehouse || "-",
                      r.location || "-",
                      r.quantity || 0,
                    ],

                },

              },

              {
                id: "categories",
              name: "Categories",
              route: "/inventory/categories",
              order: 20,
              type: "business-workspace",
              document: "InventoryCategory",
              create:{
enabled:true,
  type: "document",
                  id: "category",
                  label: "+ Category",
                  title: "Category"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/inventory/categories",
                rowsKey: "categories",
                
                search: ["name", "code", "description", "status"],
                name: r => r.name || "Unnamed Category",
                subtitle: r => [r.code || "-", r.description || "-"]
              },
              actions: [
                {
                  type: "section",
                  label: "Operations"
                },
                {
                  label: "View Items",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/items?categoryId=${row.id}`
                },
                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "Edit Category",
                  type: "select"
                },
                {
                  label: "Archive Category",
                  danger: true
                }
              ]
            },
            {
              id: "units",
              name: "Units of Measure",
              route: "/inventory/units",
              order: 30,
              type: "business-workspace",
              document: "InventoryUnit",
              create:{
enabled:true,
  type: "document",
                  id: "unit",
                  label: "+ Unit",
                  title: "Unit"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/inventory/units",
                rowsKey: "units",
                
                search: ["name", "code", "type"],
                name: r => r.name || "Unnamed Unit",
                subtitle: r => [r.code || "-", r.type || "-"]
              },
              actions: [
                {
                  type: "section",
                  label: "Usage"
                },
                {
                  label: "View Items",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/items?unitId=${row.id}`
                },
                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "Edit Unit",
                  type: "select"
                },
                {
                  label: "Archive Unit",
                  danger: true
                }
              ]
            },
            {
              id: "warehouses",
              name: "Warehouses",
              route: "/inventory/warehouses",
              order: 40,
              type: "business-workspace",
              document: "Warehouse",

              create:{
enabled:true,
  type: "document",
                  id: "warehouse",
                  label: "+ Warehouse",
                  title: "Warehouse"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/inventory/warehouses",
                rowsKey: "warehouses",
                
                search: ["name", "code", "location", "status"],

                name: r => r.name || "Unnamed Warehouse",
                subtitle: r => [r.code || "-", r.location || "-"]
              },

              actions: [
                {
                  type: "section",
                  label: "Operations"
                },
                {
                  label: "Stock Overview",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/items?warehouseId=${row.id}`
                },
                {
                  label: "Stock Movements",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/movements?warehouseId=${row.id}`
                },

                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "Edit Warehouse",
                  type: "select"
                },
                {
                  label: "Archive Warehouse",
                  danger: true
                }
              ]
            },
            {
              id: "locations",
              name: "Locations",
              route: "/inventory/locations",
              order: 50,
              type: "business-workspace",
              document: "InventoryLocation",

              create:{
enabled:true,
  type: "document",
                  id: "location",
                  label: "+ Location",
                  title: "Location"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/inventory/locations",
                rowsKey: "locations",
                
                search: [
                  "name",
                  "code",
                  "warehouse",
                  "type"
                ],

                name: r =>
                  r.name ||
                  "Unnamed Location",

                subtitle: r => [
                  r.code || "-",
                  r.warehouse || "-"
                ]
              },

              actions: [
                {
                  type: "section",
                  label: "Operations"
                },
                {
                  label: "View Stock",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/items?locationId=${row.id}`
                },

                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "Edit Location",
                  type: "select"
                },
                {
                  label: "Archive Location",
                  danger: true
                }
              ]
            },
            {
              id: "stock_movements",
              name: "Stock Movements",
              route: "/inventory/movements",
              order: 60,
              type: "business-workspace",
              document: "StockMovement",

              create:{
enabled:true,
  type: "document",
                  id: "movement",
                  label: "+ Movement",
                  title: "Movement"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

                api: "/api/inventory/movements",
                rowsKey: "movements",
                
                search: [
                  "item",
                  "type",
                  "reference",
                  "warehouse"
                ],

                name: r =>
                  r.item_name ||
                  r.name ||
                  "Movement",

                subtitle: r => [
                  r.type || "-",
                  r.quantity || "-"
                ]
              },

              actions: [
                {
                  type: "section",
                  label: "Operations"
                },
                {
                  label: "Adjust Stock",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/adjustments?itemId=${row.item_id}`
                },
                {
                  label: "Transfer Stock",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/transfers?itemId=${row.item_id}`
                },
                {
                  label: "Consume Stock",
                  href: ({ organizationId, row }) =>
                    `/workspace/${organizationId}/inventory/consumption?itemId=${row.item_id}`
                },

                {
                  type: "section",
                  label: "Analysis"
                },
                {
                  label: "Stock Impact",
                  type: "select"
                },

                {
                  type: "section",
                  label: "Maintenance"
                },
                {
                  label: "View Entry",
                  type: "select"
                }
              ]
            },
            { id: "transfers", name: "Transfers", route: "/inventory/transfers", order: 70 },

            { id: "adjustments", name: "Adjustments", route: "/inventory/adjustments", order: 80 },
            { id: "stock_counts", name: "Stock Counts", route: "/inventory/counts", order: 90 },
            { id: "cycle_counts", name: "Cycle Counts", route: "/inventory/cycle-counts", order: 100 },
            { id: "reservations", name: "Reservations", route: "/inventory/reservations", order: 110 },
            { id: "consumption", name: "Consumption", route: "/inventory/consumption", order: 120 },
            { id: "inventory_valuation", name: "Inventory Valuation", route: "/inventory/valuation", order: 130 },
            { id: "fifo_layers", name: "FIFO Cost Layers", route: "/inventory/fifo", order: 140 },
            { id: "weighted_average", name: "Weighted Average", route: "/inventory/weighted-average", order: 150 },
            { id: "replenishment", name: "Replenishment", route: "/inventory/replenishment", order: 160 },
            { id: "min_max", name: "Min / Max Levels", route: "/inventory/min-max", order: 170 },
            { id: "purchase_suggestions", name: "Purchase Suggestions", route: "/inventory/purchase-suggestions", order: 180 },
            { id: "expiry", name: "Expiry & Lots", route: "/inventory/expiry", order: 190 },
            { id: "inventory_dashboard", name: "Inventory Dashboard", route: "/inventory/dashboard", order: 200 }
          ]
        },

        {
          id: "warehouse",
          name: "Warehouse",
          description: "Warehouse execution, putaway, picking and transfers.",
          order: 35,
          items: [

            {
              id: "warehouse_tasks",
              name: "Warehouse Tasks",
              route: "/warehouse/tasks",
              order: 10,
              type: "business-workspace",
              ui:{
                api:"/api/inventory/warehouse/tasks",
                rowsKey:"tasks"
              },

              actions:[
                {
                  type:"section",
                  label:"Warehouse Operations"
                },
                {
                  label:"Complete Task",
                  type:"complete"
                },
                {
                  label:"Assign Task",
                  type:"assign"
                },              ]
            },

          ]
        }
      ]
    },

    finance: {
      title: "Finance",
      description: "Accounting, tax, treasury, reporting, compliance and accounting-firm operations.",
      groups: [
        {
          id: "accounting",
          name: "Accounting",
          description: "Core accounting, posting, ledgers and accounting structure.",
          order: 10,
          items: [
            { id: "chart_of_accounts", name: "Chart of Accounts", route: "/finance/chart-of-accounts", description: "Maintain account structure.", order: 10, type: "business-workspace", document: "Account", create:{
enabled:true,
  type: "document",
                  id: "account",
                  engine:"create",
                  capability:"account",
action:"upsertAccount",
form:"chart-of-account",
api:"/api/finance/chart-of-accounts/upsert",
                  label: "+ Account",
                  title: "Account"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                {
                  id: "delete",
                  type: "delete",
                  label: "Delete Account",
                  api: "/api/finance/chart-of-accounts/delete",
                  method: "POST",
                  danger: true
                }
              ],
 api: "/api/finance/chart-of-accounts", rowsKey: "accounts",  search: ["account_code","account_name","account_type","category","status"], name: r => r.account_name || r.name || "Unnamed Account", subtitle: r => [r.account_code || "-", r.account_type || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/chart-of-accounts"
},

data:{
  capability:"account"
},
},
            { id: "general_ledger", name: "General Ledger", route: "/finance/ledger", description: "Review ledger activity and balances.", order: 20, type: "business-workspace", document: "LedgerEntry", 
create:{
enabled:false
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
              ],

  enabled:false,

  api: "/api/finance/general-ledger",
  rowsKey: "entries",
  search: [
    "account_code",
    "account_name",
    "reference",
    "description",
    "created_at"
  ],
  name: r =>
    r.account_name ||
    r.reference ||
    "Ledger Entry",
  subtitle: r => [
    r.account_code || "-",
    r.created_at || "-"
  ]

},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/general-ledger"
},

data:{
  capability:"ledger_entry"
}
},
            { id: "journals", name: "Journals", route: "/finance/journals", description: "Create, review and reverse journal entries.", order: 30, type: "business-workspace", document: "JournalEntry", create:{
enabled:true,
type:"document",
engine:"create",
id:"journal_entry",
form:"journal-entry",
api:"/api/finance/journals/create",
label:"+ Journal",
title:"New Journal Entry"
},

ui:{
              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                {
                  id: "request_reversal",
                  type: "capability",
                  label: "Request Reversal",
                  capability: "general_ledger",
                  action: "requestJournalReversalCommand"
                }
              ],
 api: "/api/finance/journals", rowsKey: "journals",  search: ["journal_number","reference","description","status"], name: r => r.journal_number || r.reference || "Journal", subtitle: r => [r.status || "-", r.created_at || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/journals"
},

data:{
  capability:"journal_entry"
},

actions:[] },
            { id: "trial_balance", name: "Trial Balance", route: "/finance/trial-balance", description: "Review trial balance by period.", order: 40, type: "business-workspace", document: "TrialBalanceLine", 
create:{
enabled:false
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/trial-balance", rowsKey: "rows",   search: ["account_code","account_name","account_type"], name: r => r.account_name || "Trial Balance Line", subtitle: r => [r.account_code || "-", r.account_type || "-"] },

runtime:{
 renderer:"MasterDataRuntimeWorkCenter",
 listApi:"/api/finance/trial-balance"
},

data:{
 capability:"trial_balance"
}
},
            { id: "fiscal_periods", name: "Fiscal Periods", route: "/finance/fiscal-periods", description: "Manage fiscal periods and locks.", order: 50, type: "business-workspace", document: "FiscalPeriod", create:{
enabled:false
},

ui:{
 api: "/api/finance/periods", rowsKey: "periods",  search: ["period_name","status"], name: r => r.period_name || "Unnamed Period", subtitle: r => [r.start_date || "-", r.end_date || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/periods"
},

data:{
  capability:"fiscal_period"
},

actions:[
  {
    type:"edit",
    label:"Edit Period"
  }
]
},
            { id: "dimensions", name: "Dimensions", route: "/finance/dimensions", description: "Manage departments, cost centers and reporting dimensions.", order: 60, type: "business-workspace", document: "Dimension", create:{
enabled:false
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/dimensions/runtime", rowsKey: "costCenters",  search: ["name","code","type"], name: r => r.name || "Unnamed Dimension", subtitle: r => [r.type || "-", r.code || "-"] }, runtime:{renderer:"MasterDataRuntimeWorkCenter",listApi:"/api/finance/dimensions/runtime"}, data:{capability:"cost_center"} },
            { id: "opening_balances", name: "Opening Balances", route: "/finance/opening-balances", description: "Load opening balances for new entities and clients.", order: 70, type: "business-workspace", document: "OpeningBalance", status: "planned" },
            { id: "recurring_journals", name: "Recurring Journals", route: "/finance/recurring-journals", description: "Manage recurring journals and scheduled postings.", order: 80, type: "business-workspace", document: "RecurringJournal", status: "planned" }
          ],
        },
        {
          id: "order_to_cash",
          name: "Order to Cash",
          description: "Customers, invoices, receivables, collections and revenue.",
          order: 20,
          items: [
            { id: "customers", name: "Customers", route: "/finance/customers", description: "Manage finance customer records.", order: 10, type: "business-workspace", document: "Customer", create:{
enabled:true,
type:"document",
engine:"create",
id:"customer",
capability:"customer",
action:"createCustomer",
form:"customer",
api:"/api/customers/upsert",
label:"+ Customer",
title:"Customer"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/customers", rowsKey: "customers",  search: ["customer_name","customer_email","customer_phone","tax_id","tier","status"], name: r => r.customer_name || r.name || "Unnamed Customer", subtitle: r => [r.customer_email || r.email || "-", r.customer_phone || r.phone || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/customers"
},

data:{
  capability:"customer",
  repository:"CustomerRepository",
  applicationService:"createCustomer"
},

actions: [
  {
    type:"capability",
    label:"Create Invoice",
    capability:"accounts_receivable",
    action:"CreateCustomerInvoice",
    form:"customer-invoice"
  },
  {
    type:"capability",
    label:"Create Payment",
    capability:"accounts_receivable",
    action:"postCustomerPayment"
  },
  {
    type:"capability",
    label:"View Statement",
    capability:"finance.customer_statement.view"
  },
  {
    type:"edit",
    label:"Edit Customer"
  },
  {
    type:"archive",
    label:"Archive Customer"
  }
] },
            { id: "customer_invoices", name: "Customer Invoices", route: "/finance/customer-invoices", description: "Create, review, post and send customer invoices.", order: 20, type: "business-workspace", document: "CustomerInvoice", launchFrom: ["customers","accounts_receivable","commercial/customers"], create:{
  enabled:true,

  engine:"create",

  id:"customer_invoice",

  label:"+ Invoice",

  title:"Invoice",

  domain:"finance",

  capability:"accounts_receivable",

  action:"CreateCustomerInvoice",

  form:"customer-invoice"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },

                {
                  id:"preview",
                  label:"Preview",
                  type:"preview",
                  engine:"preview"
                },

                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/customer-invoices/list", rowsKey: "invoices",  search: ["invoice_number","customer_name","status","due_date"], name: r => r.invoice_number || "Customer Invoice", subtitle: r => [r.customer_name || "-", r.status || "-"] } },
            { id: "accounts_receivable", name: "Accounts Receivable", route: "/finance/ar", description: "Review receivable balances and activity.", order: 30, type: "business-workspace", document: "Receivable", 
create:{
enabled:true,
  type: "document",
                  id: "payment",
                  label: "+ Payment",
                  title: "Payment"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/accounts-receivable/list", rowsKey: "receivables",   search: ["customer_name","invoice_number","status","due_date"], name: r => r.customer_name || r.invoice_number || "Receivable", subtitle: r => [r.invoice_number || "-", r.status || "-"] } },
            { id: "customer_payments", name: "Customer Payments", route: "/finance/customer-payments", description: "Receive and allocate customer payments.", order: 40, type: "business-workspace", document: "CustomerPayment", launchFrom: ["customers","accounts_receivable"], create:{
enabled:false
},

ui:{
              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/customer-payments/list", rowsKey: "payments",  search: ["payment_number","customer_name","status","method"], name: r => r.payment_number || "Customer Payment", subtitle: r => [r.customer_name || "-", r.status || "-"] } },
            { id: "collections", name: "Collections", route: "/finance/collections", description: "Manage collections and overdue balances.", order: 50, type: "business-workspace", document: "CollectionCase", status: "planned" },
            { id: "customer_statements", name: "Customer Statements", route: "/finance/customer-statements", description: "Generate and review customer statements.", order: 60, type: "business-workspace", document: "CustomerStatement", status: "planned" },
            { id: "revenue_recognition", name: "Revenue Recognition", route: "/finance/revenue-recognition", description: "Recognize revenue according to rules.", order: 70, type: "business-workspace", document: "RevenueRecognitionSchedule", status: "planned" }
          ],
        },
        {
          id: "procure_to_pay",
          name: "Procure to Pay",
          description: "Vendors, purchase documents, bills, matching and payments.",
          order: 30,
          items: [
            { id: "vendors", name: "Vendors", route: "/finance/vendors", description: "Manage vendor finance records.", order: 10, type: "business-workspace", document: "Vendor", create:{
enabled:true,
  type: "document",
                  id: "vendor",
                  engine:"create",
                  capability:"vendor",
                  form:"vendor-master",
                  api:"/api/finance/vendors/upsert",
                  label: "+ Vendor",
                  title: "Vendor"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/vendors", rowsKey: "vendors",  search: ["vendor_name","name","legal_name","vendor_email","email","vendor_phone","phone","tax_id","category","payment_terms","status"], name: r => r.vendor_name || r.name || r.legal_name || "Unnamed Vendor", subtitle: r => [r.vendor_code || r.code || "-", r.vendor_email || r.email || "-", r.vendor_phone || r.phone || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/vendors"
},

data:{
  capability:"vendor",
  repository:"VendorRepository",
  applicationService:"createVendor"
},

actions:[
  {
    type:"capability",
    label:"Create Bill",
    capability:"accounts_payable",
    action:"CreateVendorInvoice"
  },
  {
    type:"capability",
    label:"Create Payment",
    capability:"accounts_payable",
    action:"processVendorPaymentCommand"
  },
  {
    type:"capability",
    label:"View Statement",
    capability:"accounts_payable",
    action:"VendorStatement"
  },
  {
    type:"capability",
    label:"Purchase Orders",
    capability:"procurement.purchase_orders.view",
    action:"ViewPurchaseOrders"
  },
  {
    type:"capability",
    label:"Goods Receipts",
    capability:"procurement.goods_receipts.view",
    action:"ViewGoodsReceipts"
  },
  {
    type:"history",
    label:"Supplier History"
  },
  {
    type:"edit",
    label:"Edit Vendor"
  },
  {
    type:"archive",
    label:"Archive Vendor"
  }
] },
            { id: "purchase_orders", name: "Purchase Orders", route: "/finance/purchase-orders", description: "Review purchase commitments.", order: 20, type: "business-workspace", document: "PurchaseOrder", create:{
enabled:true,
  type: "document",
                  id: "purchase_order",
                  label: "+ Purchase Order",
                  title: "Purchase Order"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/procurement/purchase-orders/list", rowsKey: "purchaseOrders",  search: ["purchase_order_number","vendor_name","status"], name: r => r.purchase_order_number || "Purchase Order", subtitle: r => [r.vendor_name || "-", r.status || "-"] } },
            { id: "goods_receipts", name: "Goods Receipts", route: "/finance/goods-receipts", description: "Review received goods.", order: 30, type: "business-workspace", document: "GoodsReceipt", create:{
enabled:true,
  type: "document",
                  id: "receipt",
                  label: "+ Receipt",
                  title: "Receipt"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/procurement/receiving/list", rowsKey: "receipts",  search: ["receipt_number","vendor_name","status"], name: r => r.receipt_number || "Goods Receipt", subtitle: r => [r.vendor_name || "-", r.status || "-"] } },
            { id: "vendor_bills", name: "Vendor Bills", route: "/finance/vendor-bills", description: "Manage vendor bills and supplier invoices.", order: 40, type: "business-workspace", document: "VendorBill", create:{
enabled:true,
  type: "document",
                  id: "vendor_bill",
                  engine:"create",
                  capability:"accounts_payable",
                  action:"createVendorInvoiceCommand",
                  form:"vendor-bill",
                  api:"/api/finance/vendor-invoices/create",
                  label: "+ Vendor Bill",
                  title: "Vendor Bill"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/vendor-invoices/list", rowsKey: "invoices",  search: ["invoice_number","vendor_name","status","due_date"], name: r => r.invoice_number || "Vendor Bill", subtitle: r => [r.vendor_name || "-", r.status || "-"] } },
            { id: "invoice_matching", name: "Invoice Matching", route: "/finance/invoice-matching", description: "Match invoices, purchase orders and goods receipts.", order: 50, type: "business-workspace", document: "InvoiceMatch", 
create:{
enabled:true,
  type: "document",
                  id: "payment_run",
                  label: "+ Payment Run",
                  title: "Payment Run"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/invoice-matching/runtime", rowsKey: "matches",   search: ["invoice_number","purchase_order_number","status"], name: r => r.invoice_number || "Invoice Match", subtitle: r => [r.purchase_order_number || "-", r.status || "-"] } },
            { id: "accounts_payable", name: "Accounts Payable", route: "/finance/ap", description: "Manage payables and vendor balances.", order: 60, type: "business-workspace", document: "Payable", 
create:{

              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/payments/list", rowsKey: "payables",   search: ["vendor_name","invoice_number","status","due_date"], name: r => r.vendor_name || r.invoice_number || "Payable", subtitle: r => [r.invoice_number || "-", r.status || "-"] } },
            { id: "vendor_payments", name: "Vendor Payments", route: "/finance/vendor-payments", description: "Prepare and execute vendor payments.", order: 70, type: "business-workspace", document: "VendorPayment", launchFrom: ["vendors","accounts_payable"], create:{
enabled:false
},
ui:{ api: "/api/finance/payments/list", rowsKey: "payables", search: ["reference_number","vendor_name","status"], name: r => r.reference_number || "Vendor Payment", subtitle: r => [r.vendor_name || "-", r.status || "-"] } },
            { id: "vendor_statements", name: "Vendor Statements", route: "/finance/vendor-statements", description: "Generate and review vendor statements.", order: 80, type: "business-workspace", document: "VendorStatement", status: "planned" }
          ],
        },
        {
          id: "treasury",
          name: "Treasury",
          description: "Banking, liquidity, cash, reconciliation and payments.",
          order: 40,
          items: [
            { id: "bank_accounts", name: "Bank Accounts", route: "/finance/bank-accounts", description: "Manage bank accounts.", order: 10, type: "business-workspace", document: "BankAccount", create:{
enabled:true,
  type: "document",
                  id: "bank_account",
                  engine:"create",
                  capability:"bank_account",
                  action:"upsertBankAccountCommand",
                  form:"bank-account",
                  api:"/api/finance/bank-accounts/upsert",
                  label: "+ Bank Account",
                  title: "Bank Account"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/bank-accounts", rowsKey: "bankAccounts",  search: ["bank_name","account_name","account_number","currency_code","branch_name"], name: r => r.account_name || "Unnamed Account", subtitle: r => [r.bank_name || "-", r.account_number || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/bank-accounts"
},

data:{
  capability:"bank_account",
  repository:"bankAccountRepository",
  applicationService:"BankAccountsApplicationService"
},

actions:[
  {
    type:"capability",
    label:"View Transactions",
    capability:"bank_account.transactions"
  },
  {
    type:"capability",
    label:"Payments",
    capability:"bank_account.payments"
  },
  {
    type:"capability",
    label:"Reconciliation",
    capability:"bank_account.reconciliation"
  },
  {
    type:"capability",
    label:"Statement",
    capability:"bank_account.statement"
  },
  {
    type:"import",
    label:"Import Statement"
  },
  {
    type:"export",
    label:"Export"
  },
  {
    type:"edit",
    label:"Edit Account"
  },
  {
    type:"archive",
    label:"Archive Account"
  }
] },
            { id: "cash_management", name: "Cash Management", route: "/finance/cash-management", description: "Manage cash positions and liquidity.", order: 20, type: "business-workspace", document: "CashPosition", status: "planned" },
            { id: "bank_statements", name: "Bank Statements", route: "/finance/bank-statements", description: "Import and review bank statements.", order: 30, type: "business-workspace", document: "BankStatement", status: "planned" },
            { id: "cash_flow", name: "Cash Flow", route: "/finance/cash-flow", description: "Monitor cash inflows and outflows.", order: 40, type: "business-workspace", document: "CashFlowLine", 
create:{
enabled:true,
  type: "document",
                  id: "payment",
                  label: "+ Payment",
                  title: "Payment"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/treasury/liquidity", rowsKey: "rows",   search: ["label","type","period"], name: r => r.label || "Cash Flow", subtitle: r => [r.type || "-", r.period || "-"] } },
            { id: "bank_reconciliation", name: "Bank Reconciliation", route: "/finance/bank-reconciliation", description: "Reconcile bank statements.", order: 50, type: "business-workspace", document: "BankReconciliation", status: "planned" },
            { id: "payments", name: "Payments", route: "/finance/payments", description: "Manage outgoing and incoming payments.", order: 60, type: "business-workspace", document: "Payment", create:{
enabled:false
},
ui:{ api: "/api/finance/payments/list", rowsKey: "payables", search: ["reference_number","vendor_name","invoice_number","status"], name: r => r.reference_number || "Payment", subtitle: r => [r.vendor_name || "-", r.status || "-"] } },
            { id: "fx_revaluation", name: "FX Revaluation", route: "/finance/fx-revaluation", description: "Run and review foreign exchange revaluation.", order: 70, type: "business-workspace", document: "FXRevaluation", status: "planned" }
          ],
        },
        {
          id: "compliance",
          name: "Compliance",
          description: "Tax, statutory control, assets, audit, close and filings.",
          order: 50,
          items: [
            { id: "tax", name: "Tax", route: "/finance/tax", description: "Manage VAT, tax balances and tax work.", order: 10, type: "business-workspace", document: "TaxWorkItem", create:{
enabled:true,
  type: "document",
                  id: "tax_work",
                  label: "+ Tax Work",
                  title: "Tax Work"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/tax/runtime", rowsKey: "reports",  search: ["name","status","period"], name: r => r.name || "Tax Work", subtitle: r => [r.status || "-", r.period || "-"] } },
            { id: "vat_returns", name: "VAT Returns", route: "/finance/vat-returns", description: "Prepare, submit and track VAT returns.", order: 20, type: "business-workspace", document: "VATReturn", status: "planned" },
            { id: "tax_codes", name: "Tax Codes", route: "/finance/tax-codes", description: "Manage tax codes.", order: 30, type: "business-workspace", document: "TaxCode", create:{
enabled:true,
  type: "document",
                  id: "tax_code",
                  engine:"create",
                  capability:"tax_code",
                  action:"upsertTaxCode",
                  form:"tax-code",
                  api:"/api/finance/tax-codes/upsert",
                  label: "+ Tax Code",
                  title: "Tax Code"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/tax-codes", rowsKey: "taxCodes",  search: ["code","name","rate"], name: r => r.name || "Unnamed Tax Code", subtitle: r => [String(r.rate || 0) + "%"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/tax-codes"
},

data:{
  capability:"tax_code",
  repository:"taxCodeRepository",
  applicationService:"TaxCodeApplicationService"
},

actions:[
  {
    type:"edit",
    label:"Edit Tax Code"
  },
  {
    type:"archive",
    label:"Archive Tax Code"
  }
]
},
            { id: "fixed_assets", name: "Fixed Assets", route: "/finance/fixed-assets", description: "Manage fixed assets.", order: 40, type: "business-workspace", document: "FixedAsset", create:{
enabled:true,
  type: "document",
                  id: "asset",
                  engine:"create",
                  capability:"fixed_asset",
                  action:"createFixedAssetCommand",
                  form:"fixed-asset",
                  api:"/api/finance/fixed-assets/create",
                  label: "+ Asset",
                  title:"Asset"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/fixed-assets/list", rowsKey: "assets",  search: ["asset_number","name","category","status"], name: r => r.name || r.asset_name || "Fixed Asset", subtitle: r => [r.asset_number || "-", r.status || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/fixed-assets/list"
},

data:{
  capability:"fixed_asset",
  applicationService:"FixedAssetsApplicationService"
},

actions:[
  {
    type:"edit",
    label:"Edit Asset",
    api:"/api/finance/fixed-assets/update"
  },
  {
    type:"archive",
    label:"Archive Asset",
    api:"/api/finance/fixed-assets/archive"
  }
]
},
            { id: "depreciation", name: "Depreciation", route: "/finance/depreciation", description: "Run and review depreciation.", order: 50, type: "business-workspace", document: "DepreciationRun", status: "planned" },
            { id: "audit_trail", name: "Audit Trail", route: "/finance/audit-trail", description: "Review finance audit history.", order: 60, type: "business-workspace", document: "AuditEvent", 
create:{
enabled:true,
  type: "document",
                  id: "close_run",
                  label: "+ Close Run",
                  title: "Close Run"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},
ui:{ api: "/api/finance/audit-trail", rowsKey: "events",   search: ["event_type","actor","entity","created_at"], name: r => r.event_type || "Audit Event", subtitle: r => [r.actor || "-", r.created_at || "-"] } },
            { id: "period_close", name: "Period Close", route: "/finance/close", description: "Run month-end and year-end close.", order: 70, type: "business-workspace", document: "PeriodClose",

create:{
enabled:false
},

ui:{
 api:"/api/finance/close/runtime",
 rowsKey:"rows",
 search:["period","status"],
 name:r=>r.period || "Close Run",
 subtitle:r=>[r.status || "-"]
},

runtime:{
 renderer:"MasterDataRuntimeWorkCenter",
 listApi:"/api/finance/close/runtime"
},

actions:[
 {
  type:"workflow",
  label:"Run Month End Close",
  api:"/api/finance/month-end/close-period"
 },
 {
  type:"workflow",
  label:"Open Period",
  api:"/api/finance/periods/open"
 },
 {
  type:"workflow",
  label:"Update Period Status",
  api:"/api/finance/periods/update-status"
 }
],

data:{
 capability:"period_close",
 applicationService:"PeriodCloseApplicationService"
}

},
            { id: "year_end", name: "Year End", route: "/finance/year-end", description: "Prepare year-end processing.", order: 80, type: "business-workspace", document: "YearEndClose", 
create:{
enabled:false
},

ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ]
},
ui:{ api: "/api/finance/year-end/status", rowsKey: "items",   search: ["name","status"], name: r => r.name || "Year End Item", subtitle: r => [r.status || "-"] },

runtime:{
 renderer:"MasterDataRuntimeWorkCenter",
 listApi:"/api/finance/year-end/status"
},

actions:[
 {
  type:"workflow",
  label:"Close Fiscal Year",
  api:"/api/finance/year-end/close-fiscal-year"
 }
],

data:{
 capability:"year_end_close",
 applicationService:"PeriodCloseApplicationService"
}

},
            { id: "statutory_filings", name: "Statutory Filings", route: "/finance/statutory-filings", description: "Prepare and track statutory reports and government submissions.", order: 90, type: "business-workspace", document: "StatutoryFiling", status: "planned" }
          ],
        },
        {
          id: "enterprise",
          name: "Enterprise",
          description: "Entities, controls, currencies, intercompany and consolidation.",
          order: 60,
          items: [
            { id: "legal_entities", name: "Legal Entities", route: "/finance/legal-entities", description: "Manage legal entities.", order: 10, type: "business-workspace", document: "LegalEntity", create:{
enabled:true,
type:"document",
engine:"create",
capability:"legal_entity",
action:"createLegalEntity",
form:"legal-entity",
api:"/api/finance/legal-entities/create",
id:"legal_entity",
label:"+ Legal Entity",
title:"Legal Entity"
},

ui:{
 api: "/api/finance/legal-entities/list", rowsKey: "entities",  search: ["name","legal_name","code","country","tax_number","tax_id","registration_number"], name: r => r.name || r.legal_name || "Unnamed Entity", subtitle: r => [r.country || "-", r.code || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/legal-entities/list"
},

data:{
  capability:"legal_entity",
  repository:"LegalEntityRepository",
  applicationService:"LegalEntityApplicationService"
},

actions:[
  {
    type:"edit",
    label:"Edit Entity",
    api:"/api/finance/legal-entities/update"
  },
  {
    type:"archive",
    label:"Archive Entity",
    api:"/api/finance/legal-entities/toggle"
  }
]
},
            { id: "cost_centers", name: "Cost Centers", route: "/finance/cost-centers", description: "Manage cost centers.", order: 20, type: "business-workspace", document: "CostCenter", create:{
enabled:true,
  type: "document",
                  id: "cost_center",
                  engine:"create",
                  capability:"cost_center",
                  action:"createCostCenter",
                  form:"cost-center",
                  api:"/api/finance/cost-centers/create",
                  label: "+ Cost Center",
                  title: "Cost Center"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/cost-centers/list", rowsKey: "costCenters",  search: ["code","name","type","manager"], name: r => r.name || "Unnamed Cost Center", subtitle: r => [r.code || "-", r.type || "-"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/cost-centers/list"
},

data:{
  capability:"cost_center",
  repository:"CostCenterRepository",
  applicationService:"CostCenterApplicationService"
},

actions:[
  {
    type:"edit",
    label:"Edit Cost Center",
    api:"/api/finance/cost-centers/update"
  },
  {
    type:"archive",
    label:"Archive Cost Center",
    api:"/api/finance/cost-centers/toggle"
  }
]
},
            { id: "currencies", name: "Currencies", route: "/finance/currencies", description: "Manage currencies.", order: 30, type: "business-workspace", document: "Currency", create:{
enabled:true,
  type: "document",
                  id: "currency",
                  engine:"create",
                  capability:"currency",
                  action:"upsertCurrency",
                  form:"currency",
                  api:"/api/finance/currencies/upsert",
                  label: "+ Currency",
                  title: "Currency"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/currencies", rowsKey: "currencies",  search: ["code","name","symbol"], name: r => r.name || "Unnamed Currency", subtitle: r => [String(r.code || "-"), String(r.symbol || "-")] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/currencies"
},

data:{
  capability:"currency"
},

actions:[
  {
    type:"edit",
    label:"Edit Currency"
  },
  {
    type:"archive",
    label:"Archive Currency"
  }
]
},
            { id: "intercompany", name: "Intercompany", route: "/finance/intercompany", description: "Manage intercompany activity.", order: 40, type: "business-workspace", document: "IntercompanyTransaction", create:{
enabled:true,
type:"document",
engine:"create",
capability:"intercompany",
action:"createIntercompanyTransactionCommand",
form:"intercompany",
api:"/api/finance/intercompany/create",
id:"intercompany",
label:"+ Intercompany",
title:"Intercompany"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/intercompany/runtime", rowsKey: "transactions",  search: ["transaction_number","from_entity","to_entity","status"], name: r => r.transaction_number || "Intercompany Transaction", subtitle: r => [r.from_entity || "-", r.to_entity || "-"] },

runtime:{
 renderer:"MasterDataRuntimeWorkCenter",
 listApi:"/api/finance/intercompany/runtime"
},

data:{
 capability:"intercompany",
 applicationService:"IntercompanyApplicationService"
},

actions:[
 {
  type:"capability",
  label:"Reconcile",
  capability:"intercompany",
  action:"runIntercompanyReconciliationCommand"
 },
 {
  type:"capability",
  label:"Settle",
  capability:"intercompany",
  action:"settleIntercompanyTransactionCommand"
 }
]
},
            { id: "payment_terms", name: "Payment Terms", route: "/finance/payment-terms", description: "Manage payment terms.", order: 50, type: "business-workspace", document: "PaymentTerm", create:{
enabled:true,
  type: "document",
                  id: "payment_term",
                  engine:"create",
                  capability:"payment_term",
                  action:"upsertPaymentTerm",
                  form:"payment-term",
                  api:"/api/finance/payment-terms/upsert",
                  label: "+ Payment Term",
                  title: "Payment Term"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/payment-terms", rowsKey: "paymentTerms",  search: ["name","code","days"], name: r => r.name || "Unnamed Payment Term", subtitle: r => [String(r.days || 0) + " days"] },

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/payment-terms"
},

data:{
  capability:"payment_term",
  repository:"paymentTermRepository",
  applicationService:"PaymentTermsApplicationService"
},

actions:[
  {
    type:"edit",
    label:"Edit Payment Term"
  },
  {
    type:"archive",
    label:"Archive Payment Term"
  }
]
},
            { id: "consolidation", name: "Consolidation", route: "/finance/consolidation", description: "Consolidate financial results.", order: 60, type: "business-workspace", document: "ConsolidationRun", create:{
enabled:false
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],
 api: "/api/finance/consolidation", rowsKey: "rows",  search: ["name","status","period"], name: r => r.name || "Consolidation", subtitle: r => [r.status || "-", r.period || "-"] },

runtime:{
 renderer:"MasterDataRuntimeWorkCenter",
 listApi:"/api/finance/consolidation"
},

data:{
 capability:"consolidation"
},

actions:[
 {
  type:"capability",
  label:"Run Consolidation",
  capability:"intercompany",
  action:"runConsolidation"
 }
]
}
          ],
        },
        {
          id: "management",
          name: "Management",
          description: "Budgets, forecasts, KPIs, executive control and AI insights.",
          order: 70,
          items: [
            { id: "budgeting", name: "Budgeting", route: "/finance/budgeting", description: "Manage budgets.", order: 10, type: "business-workspace", document: "Budget",

create:{
enabled:true,
type:"wizard",
engine:"create",
id:"budget",
form:"budget",
api:"/api/finance/budgeting/create",
label:"+ Budget",
title:"New Budget"
},
ui:{
topMenu:[
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],
rowMenu:[
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  api:"/api/finance/budgeting/runtime",
  rowsKey:"rows",
  search:["name","period","status"],
  name:r=>r.name||"Budget",
  subtitle:r=>[r.period||"-",r.status||"-"]
},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/budgeting/runtime",
  createApi:"/api/finance/budgeting/create",
  varianceApi:"/api/finance/budgeting/variance"
},

actions:[
  {
    type:"report",
    label:"Variance Analysis",
    api:"/api/finance/budgeting/variance"
  },
  {
    type:"workflow",
    label:"Generate Forecast",
    api:"/api/finance/forecast",
    workflow:"runForecasting",
    capability:"buildRevenueForecast"
  } 
],

data:{
  repository:"BudgetRepository",
  applicationService:"BudgetApplicationService",
  tables:["finance_budgets","finance_actuals","accounting_forecasts"]
},

analytics:{
  reports:["Budget Variance","Forecast vs Actual"]
},

ai:{
  capabilities:["Revenue Forecast","Budget Recommendations"]
},

permissions:{
  view:"finance.budget.view",
  create:"finance.budget.create",
  update:"finance.budget.update",
  approve:"finance.budget.approve"
}

},
            { id: "forecasting", name: "Forecasting", route: "/finance/forecast", description: "Prepare forecasts.", order: 20, type: "business-workspace", document: "Forecast",

create:{
enabled:false
},

ui:{
  api:"/api/finance/forecast",
  rowsKey:"rows",
  search:["name","period","status"],
  name:r=>r.name||"Forecast",
  subtitle:r=>[r.period||"-",r.status||"-"]
},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/forecast"
},

actions:{
  generate:{
    type:"workflow",
    api:"/api/finance/forecast",
    workflow:"generateFinancialForecast"
  },
  revenueForecast:{
    type:"capability",
    capability:"buildRevenueForecast",
    action:"buildRevenueForecastCommand",
    api:"/api/finance/forecast"
  }
},

data:{
  applicationService:"generateFinancialForecast",
  capability:"buildRevenueForecast",
  tables:["daily_sales_items","general_ledger"]
},

analytics:{
  reports:[
    "Revenue Forecast",
    "Year Forecast"
  ]
},

ai:{
  capabilities:[
    "Revenue Forecast"
  ]
},

permissions:{
  view:"finance.forecast.view",
  create:"finance.forecast.create",
  generate:"finance.forecast.generate"
}

},
            { id: "finance_kpis", name: "KPIs", route: "/finance/kpis", description: "Review finance KPIs.", order: 30, type: "business-workspace", document: "FinanceKPI",

create:{

              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},

ui:{
  api:"/api/finance/kpis",
  rowsKey:"rows",
  search:["name","category"],
  name:r=>r.name||"KPI",
  subtitle:r=>[r.category||"-"]
},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/kpis"
},

actions:{
  refresh:{
    type:"runtime",
    api:"/api/finance/kpis",
    method:"GET"
  },
  executive:{
    type:"report",
    report:"getExecutiveKPIs",
    api:"/api/finance/executive-dashboard/kpi"
  }
},

data:{
  report:"getAccountingKPIs"
},

analytics:{
  reports:[
    "Accounting KPIs",
    "Executive KPIs"
  ]
},

ai:{
  capabilities:[
    "KPI Analysis"
  ]
},

permissions:{
  view:"finance.kpi.view"
}

},
            { id: "executive_dashboard", name: "Executive Dashboard", route: "/finance/executive-dashboard", description: "Open finance executive reporting.", order: 40, type: "business-workspace", document: "ExecutiveDashboard",

create:{

              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},

ui:{
  api:"/api/finance/executive-dashboard/kpi",
  rowsKey:"rows",
  search:["name","category"],
  name:r=>r.name||"Executive Metric",
  subtitle:r=>[r.category||"-"]
},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/executive-dashboard/kpi"
},

actions:{
  alerts:{
    type:"runtime",
    api:"/api/finance/executive-dashboard/alerts"
  },
  entityRanking:{
    type:"runtime",
    api:"/api/finance/executive-dashboard/entity-ranking"
  }
},

data:{
  report:"getExecutiveFinancialSummary"
},

analytics:{
  reports:[
    "Executive KPIs",
    "Executive Alerts",
    "Entity Ranking"
  ]
},

ai:{
  capabilities:[
    "Executive Insights"
  ]
},

permissions:{
  view:"finance.executive.view"
}

},
            
            { id: "financial_health", name: "Financial Health", route: "/finance/health", description: "Validate accounting integrity and finance health.", order: 50, type: "business-workspace", document: "FinanceHealthCheck",

create:{

              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},

ui:{
  api:"/api/finance/health",
  rowsKey:"issues",
  search:["type","entry","severity"],
  name:r=>r.type||"Health Issue",
  subtitle:r=>[r.entry||"-",r.severity||"-"]
},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/health"
},

actions:{
  scan:{
    type:"runtime",
    api:"/api/finance/health",
    method:"GET"
  }
},

data:{
  report:"getEnterpriseHealth"
},

analytics:{
  reports:[
    "Enterprise Health",
    "Finance Health"
  ]
},

ai:{
  capabilities:[
    "Health Assessment"
  ]
},

permissions:{
  view:"finance.health.view"
}

},

            { id: "ai_insights", name: "AI Insights", route: "/finance/insights", description: "AI-assisted finance insights and recommendations.", order: 60, type: "business-workspace", document: "FinanceInsight",

create:{

              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},

ui:{
  api:"/api/finance/insights",
  rowsKey:"insights",
  search:["title","severity","category"],
  name:r=>r.title||"Insight",
  subtitle:r=>[r.category||"-",r.severity||"-"]
},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  listApi:"/api/finance/insights"
},

actions:{
  refresh:{
    type:"runtime",
    api:"/api/finance/insights",
    method:"GET"
  }
},

data:{
  engine:"FinanceInsightEngine"
},

analytics:{
  reports:[
    "Strategic Insights"
  ]
},

ai:{
  capabilities:[
    "Finance Insights",
    "Strategic Insights"
  ]
},

permissions:{
  view:"finance.insights.view"
}

},
          ],
        },
        {
          id: "reporting",
          name: "Reporting",
          description: "Statements, management reports, analytics and scheduled reporting.",
          order: 80,
          items: [
            { id: "financial_statements", name: "Financial Statements", route: "/finance/statements", description: "Balance sheet, P&L and cash flow.", order: 10, type: "business-workspace", document: "FinancialStatement",

create:{

              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:false
},

ui:{
  rowsKey:"rows",
  search:["name","period","statement_type"],
  name:r=>r.name||"Financial Statement",
  subtitle:r=>[r.period||"-",r.statement_type||"-"]
},

runtime:{
  renderer:"ReportWorkCenter"
},

actions:[
  {
    id:"profit_loss",
    type:"report",
    reportType:"profit_loss",
    label:"Profit & Loss",
    api:"/api/finance/reports/profit-loss"
  },
  {
    id:"balance_sheet",
    type:"report",
    reportType:"balance_sheet",
    label:"Balance Sheet",
    api:"/api/finance/reports/balance-sheet"
  },
  {
    id:"cash_flow",
    type:"report",
    reportType:"cash_flow",
    label:"Cash Flow",
    api:"/api/finance/reports/cash-flow"
  }
],

data:{
  statements:[
    "ProfitLoss",
    "BalanceSheet",
    "CashFlow"
  ]
},

analytics:{
  reports:[
    "Profit & Loss",
    "Balance Sheet",
    "Cash Flow"
  ]
},

ai:{
  capabilities:[
    "Statement Analysis"
  ]
},

permissions:{
  view:"finance.statements.view"
}

},
            { id: "management_reports", name: "Management Reports", route: "/finance/management-reports", description: "Operational management reports.", order: 20, type: "business-workspace", document: "ManagementReport", status: "active",
              create:{ enabled:false },
              ui:{ api:"/api/finance/management-reports", rowsKey:"rows", search:["period","status"], name:r=>r.name||r.title||"Management Report", subtitle:r=>[r.period||"-",r.status||"Generated"] },
              actions:[{ id:"management_report", type:"report", label:"Open Management Report", api:"/api/finance/management-reports" }],
              analytics:{ reports:["Management Report"] }
            },
            { id: "finance_analytics", name: "Analytics", route: "/finance/reports", description: "Analyze finance performance.", order: 30, type: "business-workspace", document: "FinanceAnalytics", status: "active",
              create:{ enabled:false },
              ui:{ api:"/api/finance/reports/profit-loss", rowsKey:"rows", search:["account_name","account_code","period"], name:r=>r.account_name||r.name||"Finance Result", subtitle:r=>[r.account_code||"-",r.period||"-"] },
              actions:[{ id:"profit_loss", type:"report", label:"Profit & Loss", api:"/api/finance/reports/profit-loss" }],
              analytics:{ reports:["Profit & Loss"] }
            },
            { id: "report_builder", name: "Report Builder", route: "/finance/report-builder", description: "Build custom finance reports.", order: 40, type: "business-workspace", document: "ReportTemplate", status: "planned" },
            { id: "scheduled_reports", name: "Scheduled Reports", route: "/finance/scheduled-reports", description: "Schedule recurring finance reports.", order: 50, type: "business-workspace", document: "ScheduledReport", status: "planned" }
          ],
        },
        {
          id: "administration",
          name: "Finance Administration",
          description: "Client setup, posting rules, tax settings, integrations and governance.",
          order: 90,
          items: [
            { id: "organization_profile", name: "Organization Profile", route: "/finance/organization-profile", description: "Configure client/company accounting profile.", order: 10, type: "business-workspace", document: "FinanceOrganizationProfile", status: "planned" },
            { id: "accounting_settings", name: "Accounting Settings", route: "/finance/accounting-settings", description: "Configure accounting behavior for this organization.", order: 20, type: "business-workspace", document: "AccountingSettings", status: "planned" },
            { id: "number_sequences", name: "Number Sequences", route: "/finance/number-sequences", description: "Configure document numbering.", order: 30, type: "business-workspace", document: "NumberSequence", status: "planned" },
            { id: "posting_rules", name: "Posting Rules", route: "/finance/posting-rules", description: "Configure posting and automation rules.", order: 40, type: "business-workspace", document: "PostingRule", status: "planned" },
            { id: "approval_workflows", name: "Approval Workflows", route: "/finance/approval-workflows", description: "Configure approvals and controls.", order: 50, type: "business-workspace", document: "ApprovalWorkflow", status: "planned" },
            { id: "government_connections", name: "Government Connections", route: "/finance/government-connections", description: "Connect tax authorities, VAT submission and statutory portals.", order: 60, type: "business-workspace", document: "GovernmentConnection", status: "planned" },
            { id: "banking_integrations", name: "Banking Integrations", route: "/finance/banking-integrations", description: "Connect banking APIs and statement feeds.", order: 70, type: "business-workspace", document: "BankingIntegration", status: "planned" },
            { id: "exchange_rates", name: "Exchange Rates", route: "/finance/exchange-rates", description: "Manage exchange rate sources and rates.", order: 80, type: "business-workspace", document: "ExchangeRate", status: "planned" },
            { id: "e_invoicing", name: "E-Invoicing", route: "/finance/e-invoicing", description: "Configure e-invoicing networks and rules.", order: 90, type: "business-workspace", document: "EInvoicingSettings", status: "planned" },
            { id: "document_templates", name: "Document Templates", route: "/finance/document-templates", description: "Configure finance document templates.", order: 100, type: "business-workspace", document: "DocumentTemplate", status: "planned" },
            { id: "finance_permissions", name: "Finance Permissions", route: "/finance/permissions", description: "Manage finance roles and access.", order: 110, type: "business-workspace", document: "FinancePermission",

create:{

              topMenu: [
                { id: "new", type: "create" },
                { id: "reports", type: "reports" },
                { id: "export", type: "export" },
                { id: "import", type: "import" },
                { id: "automation", type: "automation" },
                { id: "ai", type: "ai" },
                { id: "settings", type: "settings" }
              ],

              rowMenu: [
                { id: "open", type: "open" },
                { id: "edit", type: "edit" },
                { id: "duplicate", type: "duplicate" },
                { id: "history", type: "history" },
                { id: "attachments", type: "attachments" },
                { id: "delete", type: "delete" }
              ],

  enabled:true,
  type:"document",
  id:"finance_permission",
  form:"finance-permission",
  label:"+ Permission",
  title:"Grant Finance Permission",
  api:"/api/finance/role-permissions/create"
},

ui:{
  api:"/api/finance/role-permissions/list",
  rowsKey:"roles",
  search:["role_name","permission_key"]
},

runtime:{
  renderer:"MasterDataRuntimeWorkCenter",
  createApi:"/api/finance/role-permissions/create",
  checkApi:"/api/finance/role-permissions/check"
},

actions:{
  grant:{
    type:"runtime",
    api:"/api/finance/role-permissions/create"
  },
  check:{
    type:"runtime",
    api:"/api/finance/role-permissions/check"
  }
},

data:{
  applicationService:"FinanceSecurityApplicationService",
  capability:"grantFinancePermission",
  repository:"FinancePermissionRepository",
  tables:[
    "finance_roles",
    "finance_permissions",
    "finance_role_permissions",
    "user_finance_roles"
  ]
},

analytics:{
  reports:[
    "Finance Security Overview"
  ]
},

ai:{
  capabilities:[
    "Permission Review"
  ]
},

permissions:{
  view:"finance.permissions.view",
  grant:"finance.permissions.grant"
}

}
          ],
        }
      ],
    },

    services: {
      title: "Services",
      description: "Avantiqo intelligence services, capabilities, usage, wallet and platform consumption.",

      groups: [

        {
          id: "platform",
          name: "Platform Services",
          description: "Manage Avantiqo service consumption and controls.",
          order: 10,

          items: [

            {
              id: "connected_services",
              name: "Avantiqo Services",
              route: "/services/connected-services",
              description: "Available Avantiqo services and customer consumption.",
              order: 10,
              type: "business-workspace",
              renderer: "ServiceRuntimeWorkCenter",
              document: "AvantiqoService",
              status: "active",

              ui:{
                runtime:"service_domains",
                api:"/api/platform/services/domains",
                rowsKey:"rows"
              }
            },


            {
              id:"wallet",
              name:"Wallet",
              route:"/services/wallet",
              description:"Manage organization wallet and service consumption balance.",
              order:20,
              type:"business-workspace",
              renderer:"ServiceRuntimeWorkCenter",
              document:"ServiceWallet",
              status:"active",
              ui:{
                runtime:"wallet",
                api:"/api/platform/wallet"
              }
            },


            {
              id:"usage",
              name:"Usage",
              route:"/services/usage",
              description:"Review Avantiqo service usage and consumption.",
              order:30,
              type:"business-workspace",
              renderer:"ServiceRuntimeWorkCenter",
              document:"ServiceUsage",
              status:"active",
              ui:{
                runtime:"usage",
                api:"/api/platform/usage"
              }
            },


            {
              id:"billing",
              name:"Billing",
              route:"/services/billing",
              description:"Review service billing and charges.",
              order:40,
              type:"business-workspace",
              renderer:"ServiceRuntimeWorkCenter",
              document:"ServiceBilling",
              status:"active",
              ui:{
                runtime:"billing",
                api:"/api/platform/services/billing"
              }
            },


            {
              id:"budgets",
              name:"Budgets",
              route:"/services/budgets",
              description:"Manage service spending limits.",
              order:50,
              type:"business-workspace",
              renderer:"ServiceRuntimeWorkCenter",
              document:"ServiceBudget",
              status:"active",
              ui:{
                runtime:"budgets",
                api:"/api/platform/services/budgets"
              }
            }

          ]
        }

      ]
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

    compliance: {
      title: "Compliance",
      description: "Assets, obligations, renewals, risk, governance and AI monitoring.",
      groups: [
        {
          id: "assets",
          name: "Assets",
          description: "Track business assets that carry ownership, value, expiry, inspection or maintenance obligations.",
          order: 10,
          items: [
            { id: "vehicles", name: "Vehicles", route: "/compliance/assets/vehicles", description: "Cars, trucks, motorcycles, trailers and fleet records.", order: 10 },
            { id: "equipment", name: "Equipment", route: "/compliance/assets/equipment", description: "Machines, tools, devices and operational equipment.", order: 20 },
            { id: "properties", name: "Properties", route: "/compliance/assets/properties", description: "Buildings, leases, locations and property obligations.", order: 30 },
            { id: "digital_assets", name: "Digital Assets", route: "/compliance/assets/digital-assets", description: "Domains, SSL certificates, software accounts and digital renewals.", order: 40 },
          ],
        },
        {
          id: "obligations",
          name: "Obligations",
          description: "Manage business obligations, renewals, documents and responsible owners.",
          order: 20,
          items: [
            { id: "insurance", name: "Insurance", route: "/compliance/obligations/insurance", description: "Policies, coverage, renewal dates and insurance documents.", order: 10 },
            { id: "licenses", name: "Licenses", route: "/compliance/obligations/licenses", description: "Business licenses, operating licenses and professional licenses.", order: 20 },
            { id: "permits", name: "Permits", route: "/compliance/obligations/permits", description: "Government permits, authority approvals and operating permissions.", order: 30 },
            { id: "certifications", name: "Certifications", route: "/compliance/obligations/certifications", description: "ISO, safety, quality, training and employee certifications.", order: 40 },
            { id: "contracts", name: "Contracts", route: "/compliance/obligations/contracts", description: "Contract lifecycle, expiry, renewal and obligations.", order: 50 },
            { id: "subscriptions", name: "Subscriptions", route: "/compliance/obligations/subscriptions", description: "Recurring software, services, licenses and renewal costs.", order: 60 },
            { id: "warranties", name: "Warranties", route: "/compliance/obligations/warranties", description: "Warranty coverage, claims, expiry and related assets.", order: 70 },
          ],
        },
        {
          id: "monitoring",
          name: "Monitoring",
          description: "AI secretary monitoring for expiry, renewal, inspection and compliance risk.",
          order: 30,
          items: [
            { id: "expiring", name: "Expiring Items", route: "/compliance/monitoring/expiring", description: "Items requiring attention soon.", order: 10 },
            { id: "renewals", name: "Renewals", route: "/compliance/monitoring/renewals", description: "Renewal pipeline by date, owner and urgency.", order: 20 },
            { id: "inspections", name: "Inspections", route: "/compliance/monitoring/inspections", description: "Scheduled inspections, checks and follow-ups.", order: 30 },
            { id: "calendar", name: "Compliance Calendar", route: "/compliance/monitoring/calendar", description: "Timeline of upcoming obligations and events.", order: 40 },
            { id: "ai_secretary", name: "AI Secretary", route: "/compliance/monitoring/ai-secretary", description: "AI watch rules, escalations and recommended actions.", order: 50 },
          ],
        },
        {
          id: "reports",
          name: "Reports",
          description: "Risk, status, audit and compliance reporting.",
          order: 40,
          items: [
            { id: "status", name: "Compliance Status", route: "/compliance/reports/status", description: "Overall compliance state by company, entity and domain.", order: 10 },
            { id: "risk", name: "Risk Dashboard", route: "/compliance/reports/risk", description: "Expired, overdue, missing and high-risk obligations.", order: 20 },
            { id: "audit_history", name: "Audit History", route: "/compliance/reports/audit-history", description: "Timeline of changes, renewals, uploads and approvals.", order: 30 },
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
          id: "organization_structure",
          name: "Organization Structure",
          description: "Core organizational master data.",
          order: 5,
          items: [
            {
              id: "organizations",
              name: "Organizations",
              route: "/administration/organizations",
              description: "Manage organizations and companies.",
              order: 10
            },
            BusinessUnitsWorkspace,
            BusinessLocationsWorkspace,
            DepartmentsWorkspace,
            TeamsWorkspace
          ],
        },
        {
          id: "identity",
          name: "Identity",
          description: "Users, roles and permissions.",
          order: 10,
          items: [
            { id: "users", name: "Users", route: "/administration/users", description: "Manage users.", order: 10 },
            { id: "roles", name: "Roles & Permissions", route: "/administration/roles", description: "Manage roles and permissions.", order: 20 }
          ],
        },
        {
          id: "platform",
          name: "Platform Services",
          description: "Platform services, integrations and system configuration.",
          order: 10,
          items: [
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

        {
          id: "business_connections",
          name: "Business Connections",
          description: "Connect customer-owned external business accounts and assets.",
          order: 30,
          items: [
            {
              id: "social_accounts",
              name: "Social Accounts",
              category:"social",
              route: "/settings/connections/social",
              renderer:"ChannelConnectionWorkCenter",
              description: "Connect Facebook and Instagram business assets.",
              order: 10,
            },
            {
              id: "messaging_accounts",
              name: "Messaging Accounts",
              category:"messaging",
              route: "/settings/connections/messaging",
              renderer:"ChannelConnectionWorkCenter",
              description: "Connect WhatsApp Business and LINE accounts.",
              order: 20,
            },
            {
              id: "business_profiles",
              name: "Business Profiles",
              category:"business-profile",
              route: "/settings/connections/business-profiles",
              renderer:"ChannelConnectionWorkCenter",
              description: "Connect Google Business and reputation platforms.",
              order: 30,
            },
            {
              id: "commerce_connections",
              name: "Commerce Connections",
              category:"commerce",
              route: "/settings/connections/commerce",
              renderer:"ChannelConnectionWorkCenter",
              description: "Connect Shopify and commerce platforms.",
              order: 40,
            },
            {
              id: "distribution_connections",
              name: "Distribution Connections",
              category:"distribution",
              route: "/settings/connections/distribution",
              renderer:"ChannelConnectionWorkCenter",
              description: "Connect booking and distribution platforms.",
              order: 50,
            },
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

export function getPlatformHeaderItems() {
  return [...(ERP_REGISTRY.platform?.header || [])].sort((a, b) => a.order - b.order);
}

export function getPlatformBrand() {
  return ERP_REGISTRY.platform?.brand || {
    name: "Avantiqo",
    subtitle: "Synthetic Intelligence OS",
  };
}

export function getErpDomains() {
  return [...ERP_REGISTRY.domains].sort((a, b) => a.order - b.order);
}

export function getErpSolutions(activeIds = null) {
  const active =
    activeIds && activeIds.size > 0
      ? ERP_REGISTRY.solutions.filter((item) => activeIds.has(item.id))
      : ERP_REGISTRY.solutions;

  return [...active].sort((a, b) => a.order - b.order);
}

export function getPlatformServicesMeta() {
  return ERP_REGISTRY.services || null;
}

export function getWorkspaceMeta(workspaceId) {
  const id = normalizeWorkspaceId(workspaceId);
  return ERP_REGISTRY.workspaces?.[id] || null;
}

export function getWorkspaceGroups(workspaceId) {
  const id = normalizeWorkspaceId(workspaceId);
  const workspace = getWorkspaceMeta(id);

  if (!workspace) return [];

  return [...(workspace.groups || [])]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      ...group,
      items: [...(group.items || [])]
        .sort((a, b) => a.order - b.order)
        .map(item =>
          enrichWorkspaceItem({
            workspaceId: id,
            workspace,
            group,
            item,
          })
        ),
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

export function normalizeRegistryItemId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, "-")
    .trim();
}


export function getWorkspaceItemByWorkspace(workspaceId, itemId) {

  const workspace =
    ERP_REGISTRY.workspaces?.[workspaceId];

  if (!workspace) {
    return null;
  }

  const target =
    normalizeRegistryItemId(itemId);

  for (const group of workspace.groups || []) {

    for (const item of group.items || []) {

      if (
        normalizeRegistryItemId(item.id) === target
      ) {

        return enrichWorkspaceItem({
          workspaceId,
          workspace,
          group,
          item,
        });

      }

    }

  }

  return null;

}



export function getWorkspaceItemByRoute(route) {
  const cleanRoute =
    String(route || "")
      .split("?")[0]
      .replace(/\/$/, "");

  for (const workspace of Object.values(ERP_REGISTRY.workspaces || {})) {
    for (const group of workspace.groups || []) {
      for (const item of group.items || []) {
        const itemRoute =
          String(item.route || "")
            .split("?")[0]
            .replace(/\/$/, "");

        if (itemRoute === cleanRoute) {
          return {
            ...item,
            workspaceId:
              workspace.id ||
              Object.entries(ERP_REGISTRY.workspaces || {})
                .find(([, value]) => value === workspace)?.[0],
            groupId: group.id,
            groupName: group.name,
          };
        }
      }
    }
  }


  if (
    cleanRoute.includes(
      "/services/connected-services/"
    )
  ) {

    const parts =
      cleanRoute.split("/");


    const domainId =
      parts[
        parts.length - 1
      ];


    return {

      id:
        domainId,

      name:
        domainId
          .replace(/-/g, " ")
          .replace(/\\b\\w/g, c => c.toUpperCase()),

      route:
        cleanRoute,

      workspaceId:
        "services",

      groupId:
        "platform",

      groupName:
        "Platform Services",

      renderer:
        "ServiceRuntimeWorkCenter",

      document:
        "AvantiqoService",

      ui:{

        runtime:
          "service_domain_detail",

        api:
          `/api/platform/services/domains/${domainId}`,

        rowsKey:
          "rows",

      },

    };

  }


  return null;
}

export function getWorkspaceItemActions(workspaceId, itemId) {

  return (
    getWorkspaceItemByWorkspace(workspaceId, itemId)?.actions ||
    []
  );

}

export function getWorkspaceItemAction(workspaceId, itemId, actionId) {

  return getWorkspaceItemActions(workspaceId, itemId).find(
    action =>
      action.id === actionId ||
      action.engine === actionId
  ) || null;

}


export function normalizeWorkspaceActionItemId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, "-")
    .trim();
}

export function inferWorkspaceActionForm(itemId) {
  return normalizeWorkspaceActionItemId(itemId);
}

export function enrichWorkspaceItemActions({
  workspaceId,
  item,
}) {
  const normalizedId =
    normalizeWorkspaceActionItemId(item?.id);

  const existingActions =
    Array.isArray(item?.actions)
      ? item.actions
      : [];

  if (existingActions.length > 0) {
    return existingActions.map(action => ({
      ...buildWorkspaceAction({
        workspaceId,
        itemId: normalizedId,
        actionId: action.id || action.engine,
        overrides: action,
      }),
      form:
        action.form ||
        (action.id === "create" || action.engine === "create"
          ? inferWorkspaceActionForm(normalizedId)
          : action.form),
    }));
  }

  return [];
}

export function enrichWorkspaceItem({
  workspaceId,
  workspace,
  group,
  item,
}) {
  const enrichedItem = {
    ...item,
    workspaceId,
    workspaceName: workspace?.title,
    groupId: group?.id,
    groupName: group?.name,
  };

  enrichedItem.actions =
    enrichWorkspaceItemActions({
      workspaceId,
      item: enrichedItem,
    });

  return enrichedItem;
}
