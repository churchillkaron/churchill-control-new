export function getBudgetFormContract(formId) {
  if (String(formId || "").trim().toLowerCase() !== "budget") {
    return null;
  }

  return [
    {
      name: "category",
      label: "Budget Account",
      type: "lookup",
      lookup: "budget_categories",
      required: true,
      width: "full",
      description: "Choose the exact posting account so budget-to-actual comparison is deterministic.",
    },
    {
      name: "amount",
      label: "Amount",
      type: "number",
      required: true,
      min: 0,
      step: "any",
    },
  ];
}
