const NOTE_FIELD = Object.freeze({
  name: "command_note",
  label: "Anything else to record?",
  type: "textarea",
  storage: "attribute",
  placeholder: "Optional context for the person doing or reviewing this work",
});

const REASON_FIELD = Object.freeze({
  name: "reason",
  label: "Why is this needed?",
  type: "textarea",
  storage: "attribute",
  required: true,
  placeholder: "Explain the reason so the next person understands the decision",
});

const COMMANDS = Object.freeze({
  update: Object.freeze({
    title: "Edit work details",
    description: "Change the practical details of this work without changing where it is in the lifecycle.",
    confirmLabel: "Save changes",
    fields: [
      { name: "name", label: "Work name", type: "text", storage: "column" },
      { name: "description", label: "What needs to be done?", type: "textarea", storage: "column" },
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
      { name: "due_at", label: "Needs to be done by", type: "datetime-local", storage: "column" },
      NOTE_FIELD,
    ],
  }),
  revise: Object.freeze({
    title: "Send back for changes",
    description: "Move this plan back into editing and record what needs to change.",
    confirmLabel: "Send back",
    danger: false,
    fields: [REASON_FIELD],
  }),
  assign: Object.freeze({
    title: "Assign a person",
    description: "Choose who is accountable for this work. Only eligible people can be selected.",
    confirmLabel: "Assign person",
    fields: [
      {
        name: "assigned_to",
        label: "Who is doing this?",
        type: "lookup",
        storage: "column",
        required: true,
        optionsSource: "assignable-users",
      },
      {
        name: "assignment_note",
        label: "What should they know?",
        type: "textarea",
        storage: "attribute",
        placeholder: "Optional handoff, access instruction, customer note or responsibility context",
      },
    ],
  }),
  assess: Object.freeze({
    title: "Assess the situation",
    description: "Record how serious this is, what it affects, and your assessment before deciding the next action.",
    confirmLabel: "Save assessment",
    fields: [
      {
        name: "severity",
        label: "How serious is it?",
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
      { name: "impact", label: "What is affected?", type: "textarea", storage: "attribute", required: true },
      { name: "assessment", label: "What did you determine?", type: "textarea", storage: "attribute", required: true },
    ],
  }),
  resolve: Object.freeze({
    title: "Record the resolution",
    description: "Describe what fixed the problem before it is closed.",
    confirmLabel: "Mark resolved",
    fields: [
      { name: "resolution", label: "What resolved it?", type: "textarea", storage: "attribute", required: true },
      { name: "resolution_reference", label: "Supporting reference", type: "text", storage: "attribute" },
    ],
  }),
  close: Object.freeze({
    title: "Close this record",
    description: "Confirm the work is resolved and any required evidence is complete.",
    confirmLabel: "Close",
    fields: [
      { name: "closure_note", label: "Final note", type: "textarea", storage: "attribute", required: true },
    ],
  }),
  submit: Object.freeze({
    title: "Send for approval",
    description: "Send this item to the accountable reviewer.",
    confirmLabel: "Send for approval",
    fields: [NOTE_FIELD],
  }),
  approve: Object.freeze({
    title: "Approve",
    description: "Confirm that this is ready to move forward.",
    confirmLabel: "Approve",
    fields: [
      { name: "approval_note", label: "Approval note", type: "textarea", storage: "attribute", placeholder: "Optional reason or instruction for the next step" },
    ],
  }),
  publish: Object.freeze({
    title: "Make plan active",
    description: "Make this approved plan available for operational use.",
    confirmLabel: "Make active",
    fields: [NOTE_FIELD],
  }),
  release: Object.freeze({
    title: "Release to the worker",
    description: "Confirm this assigned work is ready for the responsible person to begin.",
    confirmLabel: "Release work",
    fields: [
      {
        ...NOTE_FIELD,
        label: "Anything they need before starting?",
        placeholder: "Optional final instruction, access detail or handoff note",
      },
    ],
  }),
  start: Object.freeze({
    title: "Start work",
    description: "Confirm that work has actually begun.",
    confirmLabel: "Start work",
    fields: [NOTE_FIELD],
  }),
  pause: Object.freeze({
    title: "Pause work",
    description: "Pause active work and record why it cannot continue right now.",
    confirmLabel: "Pause work",
    fields: [REASON_FIELD],
  }),
  complete: Object.freeze({
    title: "Complete work",
    description: "Confirm the work is done and record the result.",
    confirmLabel: "Complete work",
    fields: [
      { name: "completion_note", label: "What was completed?", type: "textarea", storage: "attribute", required: true },
      { name: "completion_reference", label: "Evidence or reference", type: "text", storage: "attribute" },
    ],
  }),
  validate: Object.freeze({
    title: "Accept this evidence",
    description: "Confirm the evidence is sufficient and preserve any review context.",
    confirmLabel: "Accept evidence",
    fields: [
      { name: "validation_note", label: "Review note", type: "textarea", storage: "attribute" },
    ],
  }),
  reject: Object.freeze({
    title: "Send evidence back",
    description: "Explain what is missing or incorrect so it can be fixed.",
    confirmLabel: "Send back",
    danger: true,
    fields: [REASON_FIELD],
  }),
  cancel: Object.freeze({
    title: "Cancel",
    description: "Stop this record without deleting its history.",
    confirmLabel: "Cancel",
    danger: true,
    fields: [REASON_FIELD],
  }),
  reopen: Object.freeze({
    title: "Reopen",
    description: "Reopen this item because more work is needed.",
    confirmLabel: "Reopen",
    fields: [REASON_FIELD],
  }),
  archive: Object.freeze({
    title: "Archive",
    description: "Remove this from active work while keeping its full history.",
    confirmLabel: "Archive",
    danger: true,
    fields: [REASON_FIELD],
  }),
  supersede: Object.freeze({
    title: "Replace this evidence",
    description: "Link the newer evidence that should now be used instead.",
    confirmLabel: "Replace evidence",
    danger: true,
    fields: [
      { name: "superseded_by_reference", label: "New evidence reference", type: "text", storage: "attribute", required: true },
      REASON_FIELD,
    ],
  }),
  void: Object.freeze({
    title: "Void evidence",
    description: "Mark this evidence unusable while keeping its audit history.",
    confirmLabel: "Void evidence",
    danger: true,
    fields: [REASON_FIELD],
  }),
  activate: Object.freeze({
    title: "Activate",
    description: "Make this available for operational use.",
    confirmLabel: "Activate",
    fields: [NOTE_FIELD],
  }),
  deactivate: Object.freeze({
    title: "Deactivate",
    description: "Stop new use while preserving existing references and history.",
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
    description: `Confirm the ${titleCase(command).toLowerCase()} action.`,
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