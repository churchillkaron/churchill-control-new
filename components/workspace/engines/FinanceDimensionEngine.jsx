"use client";

import CreateEngine from "./CreateEngine";

const FIELDS = [
  { name: "entity_id", label: "Legal Entity", type: "lookup", lookup: "legal_entities" },
  { name: "code", label: "Dimension Code", type: "text", required: true, placeholder: "Example: CHANNEL" },
  { name: "name", label: "Dimension Name", type: "text", required: true, placeholder: "Example: Sales Channel" },
  { name: "description", label: "Purpose and Reporting Use", type: "textarea", rows: 3, width: "full" },
  {
    name: "scope",
    label: "Scope",
    type: "select",
    required: true,
    options: [
      { value: "ENTITY", label: "Legal Entity" },
      { value: "ORGANISATION", label: "Organisation" },
    ],
  },
  {
    name: "value_type",
    label: "Value Type",
    type: "select",
    required: true,
    options: [
      { value: "LIST", label: "Controlled List" },
      { value: "TEXT", label: "Free Text" },
      { value: "NUMBER", label: "Number" },
      { value: "DATE", label: "Date" },
      { value: "BOOLEAN", label: "Yes / No" },
    ],
  },
  { name: "allow_hierarchy", label: "Allow Hierarchy", type: "boolean", defaultValue: false },
  { name: "required_on_posting", label: "Required on Posting", type: "boolean", defaultValue: false },
  { name: "effective_from", label: "Effective From", type: "date", required: true },
  { name: "effective_to", label: "Effective To", type: "date" },
  { name: "is_active", label: "Active", type: "boolean", defaultValue: true },
];

export default function FinanceDimensionEngine(props) {
  const action = {
    ...(props.action || {}),
    form: "finance-dimension",
    api: "/api/finance/dimensions/upsert",
    endpoint: "/api/finance/dimensions/upsert",
    submitLabel: "Create Dimension",
  };

  return (
    <CreateEngine
      {...props}
      action={action}
      schema={FIELDS}
      title="New Finance Dimension"
    />
  );
}
