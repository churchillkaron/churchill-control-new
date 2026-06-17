export const accountingRuntime = {
  id: "accounting",
  name: "Accounting",
  modules: [
    { id: "finance", name: "Finance", category: "Core" },
    { id: "accounting", name: "Accounting", category: "Core" },
    { id: "payroll", name: "Payroll", category: "Core" },
    { id: "analytics", name: "Analytics", category: "Analytics" }
  ],
  dashboards: [
    { id: "clients", name: "Clients" },
    { id: "tax", name: "Tax" },
    { id: "compliance", name: "Compliance" },
    { id: "cashflow", name: "Cashflow" }
  ]
};
