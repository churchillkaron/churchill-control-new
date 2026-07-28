const BASE_FIELDS = Object.freeze([
  {
    name: "name",
    label: "Name",
    type: "text",
    required: true,
    storage: "column",
    placeholder: "Describe the operational record",
  },
  {
    name: "code",
    label: "Code",
    type: "text",
    storage: "column",
    placeholder: "Optional internal reference",
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    storage: "column",
    placeholder: "Purpose, scope and expected outcome",
  },
  {
    name: "priority",
    label: "Priority",
    type: "select",
    storage: "column",
    defaultValue: "normal",
    options: [
      { value: "low", label: "Low" },
      { value: "normal", label: "Normal" },
      { value: "high", label: "High" },
      { value: "critical", label: "Critical" },
    ],
  },
]);

const LIFECYCLE_FIELDS = Object.freeze({
  master: [
    { name: "category", label: "Category", type: "text", storage: "attribute" },
    { name: "effective_from", label: "Effective From", type: "datetime-local", storage: "attribute" },
    { name: "effective_to", label: "Effective To", type: "datetime-local", storage: "attribute" },
  ],
  document: [
    { name: "reference", label: "Reference", type: "text", storage: "attribute" },
    { name: "due_at", label: "Due At", type: "datetime-local", storage: "column" },
    { name: "reason", label: "Reason", type: "textarea", storage: "attribute" },
  ],
  execution: [
    { name: "scheduled_start", label: "Scheduled Start", type: "datetime-local", storage: "column" },
    { name: "scheduled_end", label: "Scheduled End", type: "datetime-local", storage: "column" },
    { name: "due_at", label: "Due At", type: "datetime-local", storage: "column" },
    { name: "execution_notes", label: "Execution Notes", type: "textarea", storage: "attribute" },
  ],
  planning: [
    { name: "scheduled_start", label: "Planning Start", type: "datetime-local", storage: "column" },
    { name: "scheduled_end", label: "Planning End", type: "datetime-local", storage: "column" },
    { name: "due_at", label: "Decision Due", type: "datetime-local", storage: "column" },
    { name: "scenario", label: "Scenario", type: "text", storage: "attribute" },
    { name: "assumptions", label: "Assumptions", type: "textarea", storage: "attribute" },
  ],
  control: [
    {
      name: "severity",
      label: "Severity",
      type: "select",
      storage: "attribute",
      defaultValue: "medium",
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
        { value: "critical", label: "Critical" },
      ],
    },
    { name: "impact", label: "Impact", type: "textarea", storage: "attribute" },
    { name: "due_at", label: "Resolution Due", type: "datetime-local", storage: "column" },
    { name: "containment_action", label: "Immediate Containment", type: "textarea", storage: "attribute" },
  ],
  evidence: [
    { name: "observed_at", label: "Observed At", type: "datetime-local", storage: "attribute" },
    {
      name: "outcome",
      label: "Outcome",
      type: "select",
      storage: "attribute",
      defaultValue: "pending",
      options: [
        { value: "pending", label: "Pending" },
        { value: "pass", label: "Pass" },
        { value: "fail", label: "Fail" },
        { value: "accepted", label: "Accepted" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    { name: "evidence_reference", label: "Evidence Reference", type: "text", storage: "attribute" },
    { name: "notes", label: "Evidence Notes", type: "textarea", storage: "attribute" },
  ],
});

const GROUP_FIELDS = Object.freeze({
  planning: [
    { name: "demand_reference", label: "Demand Reference", type: "text", storage: "attribute" },
  ],
  orchestration: [
    { name: "queue_reference", label: "Queue Reference", type: "text", storage: "attribute" },
    { name: "routing_key", label: "Routing Key", type: "text", storage: "attribute" },
  ],
  resources: [
    { name: "source_domain", label: "Owning Domain", type: "text", storage: "column" },
    { name: "source_type", label: "Source Type", type: "text", storage: "column" },
    { name: "source_id", label: "Source ID", type: "text", storage: "column" },
    { name: "capacity_value", label: "Capacity", type: "number", storage: "attribute", step: "any" },
    { name: "capacity_unit", label: "Capacity Unit", type: "text", storage: "attribute" },
  ],
  control: [
    { name: "procedure_reference", label: "Procedure Reference", type: "text", storage: "attribute" },
    { name: "policy_reference", label: "Policy Reference", type: "text", storage: "attribute" },
  ],
  resilience: [
    { name: "affected_scope", label: "Affected Scope", type: "text", storage: "attribute" },
    { name: "immediate_action", label: "Immediate Action", type: "textarea", storage: "attribute" },
  ],
  quality: [
    { name: "requirement_reference", label: "Requirement Reference", type: "text", storage: "attribute" },
    { name: "acceptance_criteria", label: "Acceptance Criteria", type: "textarea", storage: "attribute" },
  ],
  performance: [
    { name: "target_value", label: "Target Value", type: "number", storage: "attribute", step: "any" },
    { name: "measurement_unit", label: "Measurement Unit", type: "text", storage: "attribute" },
    { name: "measurement_window", label: "Measurement Window", type: "text", storage: "attribute" },
  ],
  intelligence: [
    { name: "signal_reference", label: "Signal Reference", type: "text", storage: "attribute" },
    { name: "threshold_value", label: "Threshold Value", type: "number", storage: "attribute", step: "any" },
    { name: "threshold_unit", label: "Threshold Unit", type: "text", storage: "attribute" },
  ],
});

function dedupeFields(fields) {
  const seen = new Set();

  return fields.filter((field) => {
    if (!field?.name || seen.has(field.name)) return false;
    seen.add(field.name);
    return true;
  });
}

export function getOperationsFormSchema(capability) {
  if (!capability || capability.readOnly) return [];

  return dedupeFields([
    ...BASE_FIELDS,
    ...(LIFECYCLE_FIELDS[capability.lifecycle] || []),
    ...(GROUP_FIELDS[capability.group] || []),
  ]).map((field, index) => Object.freeze({
    ...field,
    order: (index + 1) * 10,
  }));
}

export function getOperationsInitialValues(capability) {
  return Object.fromEntries(
    getOperationsFormSchema(capability).map((field) => [
      field.name,
      field.defaultValue ?? "",
    ]),
  );
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function normaliseValue(field, value) {
  if (!hasValue(value)) return null;
  if (field.type === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return value;
}

export function buildOperationsFormPayload(schema, values = {}) {
  const payload = { status: "draft" };
  const attributes = {};

  for (const field of schema || []) {
    const value = normaliseValue(field, values[field.name]);
    if (!hasValue(value)) continue;

    if (field.storage === "column") {
      payload[field.name] = value;
    } else {
      attributes[field.name] = value;
    }
  }

  if (Object.keys(attributes).length > 0) {
    payload.attributes = attributes;
  }

  return payload;
}

export function validateOperationsForm(schema, values = {}) {
  return (schema || [])
    .filter((field) => field.required && !hasValue(values[field.name]))
    .map((field) => field.label || field.name);
}

export default getOperationsFormSchema;
