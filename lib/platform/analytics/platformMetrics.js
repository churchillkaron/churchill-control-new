export async function getModuleMetrics(moduleId, organizationId) {
  // Placeholder for dynamic metrics logic per module
  // Returns KPI values for the given organization
  // Replace 0 with real calculations later
  const moduleKPIs = {
    pos: ["Orders", "Revenue", "Customers", "Average Ticket"],
    finance: ["Revenue", "Expenses", "Profit", "Cashflow"],
    payroll: ["Employees", "Payroll", "Attendance", "Overtime"],
    inventory: ["Items", "Stock Value", "Movements", "Low Stock"],
    marketing_ai: ["Campaigns", "Reach", "Engagement", "Conversions"],
    patients: ["Patients", "New Patients", "Admissions", "Discharges"],
    appointments: ["Appointments", "Doctors", "Attendance", "No Shows"]
  };

  const kpis = moduleKPIs[moduleId] || [];
  const result = {};

  kpis.forEach(k => {
    // Placeholder: return 0 for every KPI for now
    result[k] = 0;
  });

  return result;
}
