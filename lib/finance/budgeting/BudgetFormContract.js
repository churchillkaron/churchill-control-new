export function getBudgetFormContract(formId) {
  if (String(formId || "").trim().toLowerCase() !== "budget") {
    return null;
  }

  return [
    {
      name: "category",
      label: "Category",
      type: "text",
      required: true,
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
