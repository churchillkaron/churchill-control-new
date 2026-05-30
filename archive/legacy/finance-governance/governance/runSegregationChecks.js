export async function runSegregationChecks() {
  return [
    {
      user: "manager@company.com",
      violation: "Can approve and pay invoices",
      severity: "medium",
    },
    {
      user: "finance@company.com",
      violation: "No violations",
      severity: "none",
    },
  ];
}
