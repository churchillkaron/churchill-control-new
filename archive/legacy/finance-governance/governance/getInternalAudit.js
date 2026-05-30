export async function getInternalAudit() {
  return [
    {
      area: "Accounts Payable",
      findings: "Minor approval timing issue detected.",
      risk: "low",
    },
    {
      area: "Inventory",
      findings: "Variance above threshold.",
      risk: "medium",
    },
  ];
}
