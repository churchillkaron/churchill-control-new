export const moduleRegistry = {
  // OPERATIONS
  pos: {
    name: "POS",
    capability: "Operations",
    description: "Point of sale, orders, payments, tables and revenue.",
    kpis: ["Orders", "Revenue", "Customers", "Average Ticket"],
  },
  inventory: {
    name: "Inventory",
    capability: "Operations",
    description: "Stock levels, valuation, movements and low stock alerts.",
    kpis: ["Items", "Stock Value", "Movements", "Low Stock"],
  },
  production: {
    name: "Production",
    capability: "Operations",
    description: "Production planning, batches, waste and cost management.",
    kpis: ["Batch Count", "Waste %", "Cost Efficiency"],
  },
  procurement: {
    name: "Procurement",
    capability: "Operations",
    description: "Procurement requests, purchase orders and supplier management.",
    kpis: ["POs Created", "Pending Approvals", "Suppliers Managed"],
  },
  crm: {
    name: "CRM",
    capability: "Operations",
    description: "Customer relationship management, leads, follow-ups and history.",
    kpis: ["Leads", "Customers", "Follow-ups", "Conversion Rate"],
  },
  scheduling: {
    name: "Scheduling",
    capability: "Operations",
    description: "Job, shift and task scheduling for operations teams.",
    kpis: ["Shifts Scheduled", "Coverage %", "Tasks Completed"],
  },

  // FINANCE
  finance: {
    name: "Finance",
    capability: "Finance",
    description: "Accounting, reporting, reconciliation and financial control.",
    kpis: ["Revenue", "Expenses", "Profit", "Cashflow"],
  },
  accounting: {
    name: "Accounting",
    capability: "Finance",
    description: "General ledger, journal entries and period closing.",
    kpis: ["Journal Entries", "Period Close", "Trial Balance"],
  },
  payroll: {
    name: "Payroll",
    capability: "Workforce",
    description: "Salary, attendance, approvals and payouts.",
    kpis: ["Employees Paid", "Payroll Errors", "Attendance Compliance"],
  },
  tax: {
    name: "Tax",
    capability: "Finance",
    description: "Tax filings, compliance and reporting.",
    kpis: ["Tax Filings", "Compliance %", "Payments Processed"],
  },
  budgeting: {
    name: "Budgeting",
    capability: "Finance",
    description: "Budgets, forecasts and cost planning.",
    kpis: ["Budgets Approved", "Variance %", "Forecast Accuracy"],
  },
  reporting: {
    name: "Reporting",
    capability: "Finance",
    description: "Financial reports and dashboards.",
    kpis: ["Reports Generated", "On-time Reports", "Report Views"],
  },

  // DIGITAL
  design_studio: {
    name: "Design Studio",
    capability: "Digital",
    description: "Design assets, templates, branding and marketing visuals.",
    kpis: ["Assets Created", "Templates Used", "Campaign Designs"],
  },
  website_builder: {
    name: "Website Builder",
    capability: "Digital",
    description: "Build and manage websites and landing pages.",
    kpis: ["Pages Created", "Visitors", "Conversions"],
  },
  mobile_app_builder: {
    name: "Mobile App Builder",
    capability: "Digital",
    description: "Create and manage mobile applications.",
    kpis: ["Apps Published", "Active Users", "Sessions"],
  },
  e_commerce: {
    name: "E-Commerce",
    capability: "Digital",
    description: "Manage online store, products and sales.",
    kpis: ["Orders", "Revenue", "Products Sold"],
  },
  booking_engine: {
    name: "Booking Engine",
    capability: "Digital",
    description: "Online bookings, reservations and confirmations.",
    kpis: ["Bookings", "Cancellation Rate", "Revenue"],
  },

  // INTELLIGENCE
  analytics: {
    name: "Analytics",
    capability: "Intelligence",
    description: "Operational, financial and business analytics.",
    kpis: ["Reports Generated", "KPIs Tracked", "Trends Monitored"],
  },
  ai: {
    name: "AI",
    capability: "Intelligence",
    description: "AI-powered recommendations, forecasting and optimization.",
    kpis: ["Predictions", "Recommendations Used", "Accuracy %"],
  },
  forecasting: {
    name: "Forecasting",
    capability: "Intelligence",
    description: "Demand, revenue and operational forecasting.",
    kpis: ["Forecast Accuracy", "Variance %", "Orders Forecasted"],
  },

  // AUTOMATION
  events: {
    name: "Events",
    capability: "Automation",
    description: "Event scheduling, triggers and monitoring.",
    kpis: ["Events Triggered", "Errors", "Completed Events"],
  },
  workflows: {
    name: "Workflows",
    capability: "Automation",
    description: "Automated workflows and approvals.",
    kpis: ["Workflows Run", "Pending Approvals", "Completed Tasks"],
  },
  approvals: {
    name: "Approvals",
    capability: "Automation",
    description: "Approval flows for finance, payroll and operations.",
    kpis: ["Approvals Processed", "Pending Approvals", "Rejected"],
  },

  // PORTALS
  customer_portal: {
    name: "Customer Portal",
    capability: "Portals",
    description: "External portal for customers to access services and history.",
    kpis: ["Active Users", "Requests Submitted", "Support Tickets"],
  },
  supplier_portal: {
    name: "Supplier Portal",
    capability: "Portals",
    description: "External portal for suppliers and partners.",
    kpis: ["Suppliers Active", "Orders Submitted", "Responses"],
  },
  employee_portal: {
    name: "Employee Portal",
    capability: "Portals",
    description: "Self-service portal for employees.",
    kpis: ["Users Logged In", "Requests Processed", "Tasks Completed"],
  },
  franchise_portal: {
    name: "Franchise Portal",
    capability: "Portals",
    description: "External portal for franchise management.",
    kpis: ["Franchises Active", "Orders Submitted", "Revenue"],
  },

  // ADMINISTRATION
  users: {
    name: "Users",
    capability: "Administration",
    description: "Manage users and accounts.",
    kpis: ["Active Users", "Invitations Sent", "Deactivations"],
  },
  roles: {
    name: "Roles",
    capability: "Administration",
    description: "Manage roles and access rights.",
    kpis: ["Roles Created", "Permissions Assigned", "Changes Made"],
  },
  permissions: {
    name: "Permissions",
    capability: "Administration",
    description: "Manage permissions for roles and users.",
    kpis: ["Permissions Created", "Permissions Assigned", "Conflicts Resolved"],
  },
  organizations: {
    name: "Organizations",
    capability: "Administration",
    description: "Manage organizations and tenants.",
    kpis: ["Organizations Created", "Active Organizations", "Removed"],
  },
  settings: {
    name: "Settings",
    capability: "Administration",
    description: "Platform and organization settings.",
    kpis: ["Settings Changed", "Updates Applied", "Errors"],
  },
  approvals_admin: {
    name: "Approvals",
    capability: "Administration",
    description: "Administration level approvals for workflows.",
    kpis: ["Approvals Processed", "Pending", "Rejected"],
  },
};

export function getModule(key) {
  return moduleRegistry[key] || null;
}

export function getActiveModules() {
  return Object.values(moduleRegistry);
}
