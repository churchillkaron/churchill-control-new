function cloneFields(fields) {
  return Array.isArray(fields)
    ? fields.map((field) => ({ ...field }))
    : [];
}

export function enforceFinancePermissionFormContract(formId, fields) {
  if (String(formId || "").trim().toLowerCase() !== "finance-permission") {
    return fields;
  }

  const source = cloneFields(fields);
  const notes = source.find((field) => field?.name === "notes");

  return [
    {
      name: "role_id",
      label: "Finance Role",
      type: "lookup",
      lookup: "finance_roles",
      required: true,
      width: "1/2",
    },
    {
      name: "permission_key",
      label: "Permission",
      type: "lookup",
      lookup: "finance_permissions",
      required: true,
      width: "1/2",
    },
    {
      ...(notes || {}),
      name: "notes",
      label: "Notes",
      type: "textarea",
      width: "full",
      required: false,
    },
  ];
}
