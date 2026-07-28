function cloneFields(fields) {
  return Array.isArray(fields)
    ? fields.map((field) => ({ ...field }))
    : [];
}

export function enforceFinancePermissionFormContract(formId, fields) {
  if (String(formId || "").trim().toLowerCase() !== "finance-permission") {
    return fields;
  }

  cloneFields(fields);

  return [
    {
      name: "user_id",
      label: "Staff Member",
      type: "lookup",
      lookup: "finance_assignees",
      required: true,
      width: "1/2",
    },
    {
      name: "role_id",
      label: "Finance Role",
      type: "lookup",
      lookup: "finance_roles",
      required: true,
      width: "1/2",
    },
  ];
}
