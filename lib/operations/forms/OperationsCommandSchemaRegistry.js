const NOTE_FIELD = Object.freeze({
  name: "command_note",
  label: "Command Note",
  type: "textarea",
  storage: "attribute",
  placeholder: "Record the reason, decision or supporting context",
});

const REASON_FIELD = Object.freeze({
  name: "reason",
  label: "Reason",
  type: "textarea",
  storage: "attribute",
  required: true,
  placeholder: "Explain why this lifecycle action is required",
});

const COMMANDS = Object.freeze({
  update: Object.freeze({
    title: "Update Record",
    description: "Update the controlled operational record without changing its lifecycle state.",
    confirmLabel: "Save Update",
    fields: [
      { name: "name", label: "Name", type: "text", storage: "column" },
      { name: "description", label: "Description", type: "textarea", storage: "column" },
      {
        name: "priority",
        label: "Priority",
        type: "select",
        storage: "column",
        options: [
          { value: "low", label: "Low" },
          { value: "normal", label: "Normal" },
          { value: "high", label: "High" },
          { value: "critical", label: "Critical" },
        ],
      },
      { name: "due_at", label: "Due At", type: "datetime-local", storage: "column" },
      NOTE_FIELD,
    ],
  }),
  revise: Object.freeze({
    title: "Revise Plan",
    description: "Return the published plan to a controlled revision state.",
    confirmLabel: "Revise",
    danger: false,
    fields: [REASON_FIELD],
  }),
  assign: Object.freeze({
    title: "Assign Responsibility",
    description: "Assign this record to an eligible People-owned worker reference.",
    confirmLabel: "Assign",
    fields: [
      {
        name: "assigned_to",
        label: "Assignee",
        type: "lookup",
        storage: "column",
        required: true,
        optionsSource: "assignable-users",
      },
      {
        name: "assignment_note",
        label: "Assignment Note",
        type: "textarea",
        storage: "attribute",
        placeholder: "Instructions, responsibility or handoff context",
      },
    ],
  }),
  assess: Object.freeze({
    title: "Assess Record",
    description: "Capture the operational assessment before responsibility or resolution.",
    confirmLabel: "Record Assessment",
    fields: [
      {
        name: "severity",
        label: "Severity",
        type: "select",
        storage: "attribute",
        required: true,
        defaultValue: "medium",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "critical", label: "Critical" },
        ],
      },
      { name: "impact", label: "Impact", type: "textarea", storage: "attribute", required: true },
      { name: "assessment", label: "Assessment", type: "textarea", storage: "attribute", required: true },
    ],
  }),
  resolve: Object.freeze({
    title: "Resolve Record",
    description: "Document the controlled resolution before closure.",
    confirmLabel: "Resolve",
    fields: [
      { name: "resolution", label: "Resolution", type: "textarea", storage: "attribute", required: true },
      { name: "resolution_reference", label: "Resolution Reference", type: "text", storage: "attribute" },
    ],
  }),
  close: Object.freeze({
    title: "Close Record",
    description: "Confirm that resolution and required evidence are complete.",
    confirmLabel: "Close",
    fields: [
      { name: "closure_note", label: "Closure Note", type: "textarea", storage: "attribute", required: true },
    ],
  }),
  submit: Object.freeze({
    title: "Submit for Approval",
    description: "Submit the document into its controlled approval stage.",
    confirmLabel: "Submit",
    fields: [NOTE_FIELD],
  }),
  approve: Object.freeze({
    title: "Approve Document",
    description: "Record the accountable approval decision.",
    confirmLabel: "Approve",
    fields: [
      { name: "approval_note", label: "Approval Note", type: "textarea", storage: "attribute" },
    ],
  }),
  publish: Object.freeze({
    title: "Publish Plan",
    description: "Publish the controlled plan for operational use.",
    confirmLabel: "Publish",
    fields: [NOTE_FIELD],
  }),
  release: Object.freeze({
    title: "Release Work",
    description: "Release assigned work into an executable state.",
    confirmLabel: "Release",
    fields: [NOTE_FIELD],
  }),
  start: Object.freeze({
    title: "Start Execution",
    description: "Confirm that execution has started.",
    confirmLabel: "Start",
    fields: [NOTE_FIELD],
  }),
  pause: Object.freeze({
    title: "Pause Execution",
    description: "Pause active execution while preserving the current work context.",
    confirmLabel: "Pause",
    fields: [REASON_FIELD],
  }),
  complete: Object.freeze({
    title: "Complete Work",
    description: "Confirm completion and record the resulting outcome.",
    confirmLabel: "Complete",
    fields: [
      { name: "completion_note", label: "Completion Note", type: "textarea", storage: "attribute", required: true },
      { name: "completion_reference", label: "Evidence Reference", type: "text", storage: "attribute" },
    ],
  }),
  validate: Object.freeze({
    title: "Validate Evidence",
    description: "Validate the evidence and preserve the validation context.",
    confirmLabel: "Validate",
    fields: [
      { name: "validation_note", label: "Validation Note", type: "textarea", storage: "attribute" },
    ],
  }),
  reject: Object.freeze({
    title: "Reject Evidence",
    description: "Reject the evidence and record the required correction.",
    confirmLabel: "Reject",
    danger: true,
    fields: [REASON_FIELD],
  }),
  cancel: Object.freeze({
    title: "Cancel Record",
    description: "Cancel this record without deleting its history.",
    confirmLabel: "Cancel Record",
    danger: true,
    fields: [REASON_FIELD],
  }),
  reopen: Object.freeze({
    title: "Reopen Record",
    description: "Reopen the record and explain why further work is required.",
    confirmLabel: "Reopen",
    fields: [REASON_FIELD],
  }),
  archive: Object.freeze({
    title: "Archive Record",
    description: "Archive this record while preserving its history and audit trail.",
    confirmLabel: "Archive",
    danger: true,
    fields: [REASON_FIELD],
  }),
  supersede: Object.freeze({
    title: "Supersede Evidence",
    description: "Supersede this evidence with a newer controlled record.",
    confirmLabel: "Supersede",
    danger: true,
    fields: [
      { name: "superseded_by_reference", label: "Replacement Reference", type: "text", storage: "attribute", required: true },
      REASON_FIELD,
    ],
  }),
  void: Object.freeze({
    title: "Void Evidence",
    description: "Void this evidence without removing its audit history.",
    confirmLabel: "Void",
    danger: true,
    fields: [REASON_FIELD],
  }),
  activate: Object.freeze({
    title: "Activate Record",
    description: "Make this master record available for operational use.",
    confirmLabel: "Activate",
    fields: [NOTE_FIELD],
  }),
  deactivate: Object.freeze({
    title: "Deactivate Record",
    description: "Stop new operational use while preserving existing references.",
    confirmLabel: "Deactivate",
    fields: [REASON_FIELD],
  }),
});

function titleCase(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getOperationsCommandSchema(command) {
  const configured = COMMANDS[command];

  if (configured) {
    return {
      command,
      ...configured,
      fields: configured.fields || [],
    };
  }

  return {
    command,
    title: titleCase(command),
    description: `Confirm the ${titleCase(command).toLowerCase()} lifecycle action.`,
    confirmLabel: titleCase(command),
    danger: false,
    fields: [NOTE_FIELD],
  };
}

export function getOperationsCommandInitialValues(command, record = {}) {
  const schema = getOperationsCommandSchema(command);

  return Object.fromEntries(
    schema.fields.map((field) => [
      field.name,
      field.defaultValue ?? record?.[field.name] ?? record?.attributes?.[field.name] ?? "",
    ]),
  );
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

export function validateOperationsCommand(schema, values = {}) {
  return (schema?.fields || [])
    .filter((field) => field.required && !hasValue(values[field.name]))
    .map((field) => field.label || field.name);
}

export function buildOperationsCommandPayload(schema, values = {}, optionMetadata = {}) {
  const payload = {};
  const attributes = {};

  for (const field of schema?.fields || []) {
    const value = values[field.name];
    if (!hasValue(value)) continue;

    if (field.storage === "column") {
      payload[field.name] = value;
    } else {
      attributes[field.name] = value;
    }
  }

  if (schema?.command === "assign" && values.assigned_to) {
    const selected = optionMetadata.assignees?.find((user) => user.value === values.assigned_to);
    if (selected) {
      attributes.assignee_name = selected.label;
      attributes.assignee_staff_id = selected.staff_id || null;
      attributes.assignee_party_id = selected.party_id || null;
    }
  }

  if (Object.keys(attributes).length > 0) {
    payload.attributes = attributes;
  }

  return payload;
}

export default getOperationsCommandSchema;
