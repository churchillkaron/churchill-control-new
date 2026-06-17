export const pestControlRuntime = {
  id: "pest_control",
  name: "Pest Control",
  modules: [
    { id: "operations", name: "Operations", category: "Core" },
    { id: "crm", name: "CRM", category: "Core" },
    { id: "contracts", name: "Contracts", category: "Core" },
    { id: "finance", name: "Finance", category: "Core" },
    { id: "payroll", name: "Payroll", category: "Core" },
    { id: "marketing_ai", name: "Marketing AI", category: "AI" }
  ],
  dashboards: [
    { id: "customers", name: "Customers" },
    { id: "contracts", name: "Contracts" },
    { id: "treatments", name: "Treatments" },
    { id: "technicians", name: "Technicians" },
    { id: "revenue", name: "Revenue" }
  ]
};
