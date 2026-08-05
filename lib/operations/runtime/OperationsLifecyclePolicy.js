const POLICY = Object.freeze({
  master: Object.freeze({
    initialStatus: "draft",
    transitions: Object.freeze({
      update: Object.freeze({ from: ["draft", "active", "inactive"], to: null }),
      activate: Object.freeze({ from: ["draft", "inactive"], to: "active" }),
      deactivate: Object.freeze({ from: ["active"], to: "inactive" }),
      archive: Object.freeze({ from: ["draft", "active", "inactive"], to: "archived" }),
    }),
  }),
  document: Object.freeze({
    initialStatus: "draft",
    transitions: Object.freeze({
      update: Object.freeze({ from: ["draft", "reopened"], to: null }),
      submit: Object.freeze({ from: ["draft", "reopened"], to: "submitted" }),
      approve: Object.freeze({ from: ["submitted"], to: "approved" }),
      cancel: Object.freeze({ from: ["draft", "submitted", "reopened"], to: "cancelled" }),
      reopen: Object.freeze({ from: ["cancelled"], to: "reopened" }),
    }),
  }),
  execution: Object.freeze({
    initialStatus: "draft",
    transitions: Object.freeze({
      assign: Object.freeze({ from: ["draft", "reopened"], to: "assigned" }),
      release: Object.freeze({ from: ["assigned"], to: "released" }),
      start: Object.freeze({ from: ["assigned", "released", "paused"], to: "in_progress" }),
      pause: Object.freeze({ from: ["in_progress"], to: "paused" }),
      complete: Object.freeze({ from: ["in_progress"], to: "completed" }),
      cancel: Object.freeze({
        from: ["draft", "assigned", "released", "in_progress", "paused", "reopened"],
        to: "cancelled",
      }),
      reopen: Object.freeze({ from: ["cancelled", "completed"], to: "reopened" }),
    }),
  }),
  planning: Object.freeze({
    initialStatus: "draft",
    transitions: Object.freeze({
      update: Object.freeze({ from: ["draft", "revised"], to: null }),
      publish: Object.freeze({ from: ["draft", "revised"], to: "published" }),
      revise: Object.freeze({ from: ["published"], to: "revised" }),
      cancel: Object.freeze({ from: ["draft", "revised", "published"], to: "cancelled" }),
      archive: Object.freeze({ from: ["cancelled", "published"], to: "archived" }),
    }),
  }),
  control: Object.freeze({
    initialStatus: "open",
    transitions: Object.freeze({
      assess: Object.freeze({ from: ["open", "reopened"], to: "assessed" }),
      assign: Object.freeze({ from: ["open", "assessed", "reopened"], to: "assigned" }),
      resolve: Object.freeze({ from: ["assessed", "assigned"], to: "resolved" }),
      close: Object.freeze({ from: ["resolved"], to: "closed" }),
      reopen: Object.freeze({ from: ["resolved", "closed"], to: "reopened" }),
    }),
  }),
  evidence: Object.freeze({
    initialStatus: "recorded",
    transitions: Object.freeze({
      validate: Object.freeze({ from: ["recorded"], to: "validated" }),
      reject: Object.freeze({ from: ["recorded"], to: "rejected" }),
      supersede: Object.freeze({ from: ["recorded", "validated", "rejected"], to: "superseded" }),
      void: Object.freeze({ from: ["recorded", "validated", "rejected"], to: "voided" }),
    }),
  }),
  commerce: Object.freeze({
    initialStatus: "draft",
    transitions: Object.freeze({
      configure: Object.freeze({ from: ["draft", "inactive", "active"], to: "inactive" }),
      activate: Object.freeze({ from: ["draft", "inactive"], to: "active" }),
      deactivate: Object.freeze({ from: ["active"], to: "inactive" }),
      update: Object.freeze({ from: ["draft", "reopened", "submitted"], to: null }),
      submit: Object.freeze({ from: ["draft", "reopened"], to: "submitted" }),
      cancel: Object.freeze({
        from: ["draft", "submitted", "reopened", "prepared", "allocated", "authorized", "dispatched", "held", "released"],
        to: "cancelled",
      }),
      reopen: Object.freeze({ from: ["cancelled", "closed"], to: "reopened" }),
      allocate: Object.freeze({ from: ["prepared"], to: "allocated" }),
      authorize: Object.freeze({ from: ["prepared", "allocated"], to: "authorized" }),
      capture: Object.freeze({ from: ["prepared", "allocated", "authorized"], to: "captured" }),
      void: Object.freeze({ from: ["prepared", "allocated", "authorized", "issued", "delivered"], to: "voided" }),
      refund: Object.freeze({ from: ["captured"], to: "refunded" }),
      reissue: Object.freeze({ from: ["issued", "delivered", "voided"], to: "issued" }),
      deliver: Object.freeze({ from: ["issued"], to: "delivered" }),
      record: Object.freeze({ from: ["open", "counted", "reconciled"], to: null }),
      count: Object.freeze({ from: ["open"], to: "counted" }),
      reconcile: Object.freeze({ from: ["open", "counted"], to: "reconciled" }),
      close: Object.freeze({ from: ["open", "counted", "reconciled"], to: "closed" }),
      redispatch: Object.freeze({ from: ["dispatched", "held", "released"], to: "dispatched" }),
      hold: Object.freeze({ from: ["dispatched", "released"], to: "held" }),
      release: Object.freeze({ from: ["held", "dispatched"], to: "released" }),
    }),
  }),
});

const LEGACY_STATUS_ALIASES = Object.freeze({
  create: "draft",
  record: "recorded",
  start: "in_progress",
  complete: "completed",
  cancel: "cancelled",
  reopen: "reopened",
  activate: "active",
  deactivate: "inactive",
  archive: "archived",
  submit: "submitted",
  approve: "approved",
  publish: "published",
  revise: "revised",
  assess: "assessed",
  assign: "assigned",
  resolve: "resolved",
  close: "closed",
  validate: "validated",
  reject: "rejected",
  supersede: "superseded",
  void: "voided",
});

const CREATE_STATUS_BY_COMMAND = Object.freeze({
  create: "draft",
  record: "recorded",
  report: "open",
  raise: "open",
  set: "draft",
  configure: "inactive",
  prepare: "prepared",
  issue: "issued",
  open: "open",
  dispatch: "dispatched",
});

export const OPERATIONS_CREATE_COMMANDS = Object.freeze(
  Object.keys(CREATE_STATUS_BY_COMMAND),
);

export function isOperationsCreateCommand(command) {
  return OPERATIONS_CREATE_COMMANDS.includes(
    String(command || "").trim().toLowerCase(),
  );
}

export function normaliseOperationsStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return LEGACY_STATUS_ALIASES[value] || value;
}

export function getOperationsLifecyclePolicy(lifecycle) {
  return POLICY[lifecycle] || POLICY.master;
}

export function getOperationsInitialStatus(lifecycle, command = null) {
  const createStatus = CREATE_STATUS_BY_COMMAND[
    String(command || "").trim().toLowerCase()
  ];
  return createStatus || getOperationsLifecyclePolicy(lifecycle).initialStatus;
}

export function getOperationsTransition(lifecycle, command) {
  return getOperationsLifecyclePolicy(lifecycle).transitions[command] || null;
}

export function canExecuteOperationsCommand({ lifecycle, status, command }) {
  if (isOperationsCreateCommand(command)) return true;

  const transition = getOperationsTransition(lifecycle, command);
  if (!transition) return false;

  return transition.from.includes(normaliseOperationsStatus(status));
}

export function getOperationsTargetStatus({ lifecycle, status, command }) {
  const transition = getOperationsTransition(lifecycle, command);
  if (!transition) return null;
  return transition.to || normaliseOperationsStatus(status);
}

export function getAllowedOperationsCommands({
  lifecycle,
  status,
  commands = [],
  includeCreate = false,
}) {
  return commands.filter((command) => {
    if (isOperationsCreateCommand(command)) return includeCreate;
    return canExecuteOperationsCommand({ lifecycle, status, command });
  });
}

export function assertOperationsTransition({ lifecycle, status, command }) {
  if (canExecuteOperationsCommand({ lifecycle, status, command })) return true;

  const current = normaliseOperationsStatus(status) || "unknown";
  throw new Error(
    `Invalid Operations lifecycle transition: ${lifecycle}.${command} from ${current}.`,
  );
}

export default POLICY;
