import { getCanonicalOperationsCapability } from "../runtime/CanonicalOperationsCapabilityCatalog";

export const OPERATIONS_ACTIONS = Object.freeze({
  VIEW: "view",
  CREATE: "create",
  UPDATE: "update",
  EXECUTE: "execute",
  CONTROL: "control",
  AUDIT: "audit",
  EVENTS_MANAGE: "events.manage",
  IMPORT: "import",
  AI: "ai",
  ADMINISTER: "administer",
});

const CREATE_COMMANDS = new Set([
  "create",
  "record",
  "report",
  "raise",
  "set",
  "prepare",
  "issue",
  "open",
]);
const UPDATE_COMMANDS = new Set(["update", "correct", "revise", "configure"]);
const CONTROL_COMMANDS = new Set([
  "approve", "validate", "reject", "close", "archive", "void",
  "supersede", "activate", "deactivate", "reconcile", "refund",
]);
const RESTRICTED_OVERRIDE_ACTIONS = new Set([
  OPERATIONS_ACTIONS.ADMINISTER,
  OPERATIONS_ACTIONS.EVENTS_MANAGE,
]);

export const OPERATIONS_BOOTSTRAP_ADMIN_ROLES = Object.freeze([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "ADMINISTRATOR",
  "ORGANIZATION_ADMIN",
  "ORG_ADMIN",
]);

const BOOTSTRAP_ADMIN_ROLE_SET = new Set(OPERATIONS_BOOTSTRAP_ADMIN_ROLES);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

function normalizeCapabilityId(value) {
  return normalize(value).replace(/_/g, "-");
}

function permissionMatches(granted, required) {
  const normalizedGranted = normalize(granted);
  const normalizedRequired = normalize(required);
  if (!normalizedGranted || !normalizedRequired) return false;
  if (normalizedGranted === "*" || normalizedGranted === normalizedRequired) return true;
  if (normalizedGranted.endsWith(".*")) {
    return normalizedRequired.startsWith(normalizedGranted.slice(0, -1));
  }
  return false;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

export function isOperationsBootstrapAdminRole(role) {
  return BOOTSTRAP_ADMIN_ROLE_SET.has(normalizeRole(role));
}

export function bootstrapOperationsPermissions({ permissions = [], role = null } = {}) {
  return unique([
    ...(Array.isArray(permissions) ? permissions : []),
    isOperationsBootstrapAdminRole(role) ? "operations.*" : null,
  ]);
}

export function resolveOperationsCommandAction(command) {
  const normalized = normalize(command);
  if (CREATE_COMMANDS.has(normalized)) return OPERATIONS_ACTIONS.CREATE;
  if (UPDATE_COMMANDS.has(normalized)) return OPERATIONS_ACTIONS.UPDATE;
  if (CONTROL_COMMANDS.has(normalized)) return OPERATIONS_ACTIONS.CONTROL;
  return OPERATIONS_ACTIONS.EXECUTE;
}

export function getOperationsRequiredPermissions({
  capabilityId = null,
  action = OPERATIONS_ACTIONS.VIEW,
  command = null,
} = {}) {
  const capability = capabilityId
    ? getCanonicalOperationsCapability(normalizeCapabilityId(capabilityId))
    : null;
  const resolvedAction = command
    ? resolveOperationsCommandAction(command)
    : normalize(action) || OPERATIONS_ACTIONS.VIEW;
  const group = normalize(capability?.group);
  const capabilityKey = normalizeCapabilityId(capability?.id || capabilityId);
  const managementOverride = RESTRICTED_OVERRIDE_ACTIONS.has(resolvedAction)
    ? null
    : "operations.manage";

  return unique([
    "operations.*",
    "operations.administer",
    managementOverride,
    `operations.${resolvedAction}`,
    group ? `operations.${group}.*` : null,
    group ? `operations.${group}.${resolvedAction}` : null,
    capabilityKey ? `operations.${capabilityKey}.*` : null,
    capabilityKey ? `operations.${capabilityKey}.${resolvedAction}` : null,
  ]);
}

export function hasOperationsPermission({
  permissions = [],
  capabilityId = null,
  action = OPERATIONS_ACTIONS.VIEW,
  command = null,
} = {}) {
  const required = getOperationsRequiredPermissions({ capabilityId, action, command });
  return (Array.isArray(permissions) ? permissions : []).some((permission) => (
    required.some((candidate) => permissionMatches(permission, candidate))
  ));
}

export function authorizeOperationsAccess({
  permissions = [],
  capabilityId = null,
  action = OPERATIONS_ACTIONS.VIEW,
  command = null,
} = {}) {
  const requiredPermissions = getOperationsRequiredPermissions({ capabilityId, action, command });
  return Object.freeze({
    allowed: hasOperationsPermission({ permissions, capabilityId, action, command }),
    action: command ? resolveOperationsCommandAction(command) : action,
    command: command || null,
    capability_id: capabilityId || null,
    required_permissions: requiredPermissions,
  });
}

export function filterOperationsCommands({ permissions = [], capabilityId, commands = [] } = {}) {
  return (commands || []).filter((command) => hasOperationsPermission({
    permissions,
    capabilityId,
    command,
  }));
}

export const OPERATIONS_PERMISSION_CATALOG = Object.freeze([
  "operations.view",
  "operations.create",
  "operations.update",
  "operations.execute",
  "operations.control",
  "operations.audit",
  "operations.events.manage",
  "operations.import",
  "operations.ai",
  "operations.manage",
  "operations.administer",
]);

export default Object.freeze({
  OPERATIONS_ACTIONS,
  OPERATIONS_PERMISSION_CATALOG,
  OPERATIONS_BOOTSTRAP_ADMIN_ROLES,
  isOperationsBootstrapAdminRole,
  bootstrapOperationsPermissions,
  resolveOperationsCommandAction,
  getOperationsRequiredPermissions,
  hasOperationsPermission,
  authorizeOperationsAccess,
  filterOperationsCommands,
});
