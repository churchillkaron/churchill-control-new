const TYPE_OPTIONS = [
  ["OPERATIONAL", "Operational"],
  ["ADMINISTRATIVE", "Administrative"],
  ["SALES", "Sales"],
  ["SERVICE", "Service"],
  ["PROJECT", "Project"],
  ["SHARED_SERVICE", "Shared Service"],
  ["OTHER", "Other"],
].map(([value, label]) => ({ value, label }));

const VALUE_TYPE_OPTIONS = [
  ["LIST", "Controlled List"],
  ["TEXT", "Free Text"],
  ["NUMBER", "Number"],
  ["DATE", "Date"],
  ["BOOLEAN", "Yes / No"],
].map(([value, label]) => ({ value, label }));

const SCOPE_OPTIONS = [
  ["ENTITY", "Legal Entity"],
  ["ORGANISATION", "Organisation"],
].map(([value, label]) => ({ value, label }));

const COST_CENTER_FIELDS = [
  { name: "entity_id", label: "Legal Entity", type: "lookup", lookup: "legal_entities", required: true, width: "full" },
  { name: "code", label: "Cost Centre Code", type: "text", required: true, placeholder: "Example: BOH-KITCHEN" },
  { name: "name", label: "Cost Centre Name", type: "text", required: true },
  { name: "type", label: "Cost Centre Type", type: "select", options: TYPE_OPTIONS, required: true },
  { name: "parent_cost_center_id", label: "Parent Cost Centre", type: "lookup", lookup: "cost_centers" },
  { name: "department_id", label: "Department", type: "lookup", lookup: "departments" },
  { name: "manager_user_id", label: "Manager", type: "lookup", lookup: "finance_assignees" },
  { name: "description", label: "Description", type: "textarea", rows: 3, width: "full" },
  { name: "is_active", label: "Active", type: "boolean", defaultValue: true },
];

const DIMENSION_FIELDS = [
  { name: "entity_id", label: "Legal Entity", type: "lookup", lookup: "legal_entities" },
  { name: "code", label: "Dimension Code", type: "text", required: true, placeholder: "Example: CHANNEL" },
  { name: "name", label: "Dimension Name", type: "text", required: true, placeholder: "Example: Sales Channel" },
  { name: "description", label: "Purpose and Reporting Use", type: "textarea", rows: 3, width: "full" },
  { name: "scope", label: "Scope", type: "select", options: SCOPE_OPTIONS, required: true },
  { name: "value_type", label: "Value Type", type: "select", options: VALUE_TYPE_OPTIONS, required: true },
  { name: "allow_hierarchy", label: "Allow Hierarchy", type: "boolean", defaultValue: false },
  { name: "required_on_posting", label: "Required on Posting", type: "boolean", defaultValue: false },
  { name: "effective_from", label: "Effective From", type: "date", required: true },
  { name: "effective_to", label: "Effective To", type: "date" },
  { name: "is_active", label: "Active", type: "boolean", defaultValue: true },
];

const DIMENSION_VALUE_FIELDS = [
  { name: "dimension_id", label: "Dimension", type: "lookup", lookup: "finance_dimensions", required: true, width: "full" },
  { name: "entity_id", label: "Legal Entity", type: "lookup", lookup: "legal_entities" },
  { name: "code", label: "Value Code", type: "text", required: true },
  { name: "name", label: "Value Name", type: "text", required: true },
  { name: "parent_value_id", label: "Parent Value", type: "lookup", lookup: "finance_dimension_values" },
  { name: "description", label: "Description", type: "textarea", rows: 3, width: "full" },
  { name: "effective_from", label: "Effective From", type: "date", required: true },
  { name: "effective_to", label: "Effective To", type: "date" },
  { name: "is_active", label: "Active", type: "boolean", defaultValue: true },
];

export function getFinanceDimensionFormContract(formId) {
  const normalized = String(formId || "").trim().toLowerCase();
  if (normalized === "cost-center") return COST_CENTER_FIELDS.map(field => ({ ...field }));
  if (normalized === "finance-dimension") return DIMENSION_FIELDS.map(field => ({ ...field }));
  if (normalized === "finance-dimension-value") return DIMENSION_VALUE_FIELDS.map(field => ({ ...field }));
  return null;
}
