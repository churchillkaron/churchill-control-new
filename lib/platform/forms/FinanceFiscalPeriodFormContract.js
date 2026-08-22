export function enforceFinanceFiscalPeriodFormContract(formId, fields) {
  const normalizedFormId = String(formId || "")
    .trim()
    .toLowerCase();

  if (normalizedFormId !== "fiscal-period") {
    return fields;
  }

  return [
    {
      name: "name",
      label: "Period Name",
      type: "text",
      required: true,
      width: "full",
      placeholder: "Example: August 2026",
    },
    {
      name: "start_date",
      label: "Start Date",
      type: "date",
      required: true,
      width: "1/2",
    },
    {
      name: "end_date",
      label: "End Date",
      type: "date",
      required: true,
      width: "1/2",
    },
  ];
}
