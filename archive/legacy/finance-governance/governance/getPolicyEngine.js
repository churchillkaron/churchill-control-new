export async function getPolicyEngine() {
  return [
    {
      policy: "Expense Approval",
      type: "approval",
      rule: "Expenses above 50,000 require CFO approval.",
    },
    {
      policy: "Period Close",
      type: "accounting",
      rule: "Closed periods cannot be modified.",
    },
  ];
}
