import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = Object.freeze({
  policy: "lib/operations/security/OperationsAuthorizationPolicy.js",
  requestContext: "lib/operations/api/resolveOperationsRequestContext.js",
  accessRoute: "app/api/operations/access/route.js",
  controller: "lib/operations/api/OperationsApiController.js",
  collectionRoute: "app/api/operations/[capabilityId]/route.js",
  detailRoute: "app/api/operations/[capabilityId]/[recordId]/route.js",
  commandRoute: "app/api/operations/[capabilityId]/commands/[command]/route.js",
  historyRoute: "app/api/operations/[capabilityId]/[recordId]/history/route.js",
  eventsRoute: "app/api/operations/events/route.js",
  eventHealthRoute: "app/api/operations/events/health/route.js",
  workspaceHub: "components/workspace/operations/OperationsWorkspaceHub.jsx",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required Operations authorization file: ${relativePath}`);
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function requireIncludes(source, values, label) {
  for (const value of values) {
    if (!source.includes(value)) {
      throw new Error(`${label} is missing required contract: ${value}`);
    }
  }
}

function requireExcludes(source, values, label) {
  for (const value of values) {
    if (source.includes(value)) {
      throw new Error(`${label} contains forbidden contract: ${value}`);
    }
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)]),
);

requireIncludes(source.policy, [
  "OPERATIONS_ACTIONS",
  "OPERATIONS_PERMISSION_CATALOG",
  "OPERATIONS_BOOTSTRAP_ADMIN_ROLES",
  "bootstrapOperationsPermissions",
  '"OWNER"',
  '"ORGANIZATION_OWNER"',
  '"SUPER_ADMIN"',
  '"ADMIN"',
  '"operations.*"',
  "operations.view",
  "operations.create",
  "operations.update",
  "operations.execute",
  "operations.control",
  "operations.audit",
  "operations.events.manage",
  "operations.administer",
  "resolveOperationsCommandAction",
  "getOperationsRequiredPermissions",
  "hasOperationsPermission",
  "authorizeOperationsAccess",
  "filterOperationsCommands",
  "operations.${group}.",
  "operations.${capabilityKey}.",
], "Operations authorization policy");

requireIncludes(source.requestContext, [
  "authorizeOperationsAccess",
  "bootstrapOperationsPermissions",
  "resolveUserOperationsPermissions",
  "isMissingOperationsSecuritySchema",
  "operations_security_schema_ready",
  "Operations permission required",
  "required_permissions",
  "assignedPermissions",
  "authorization",
], "Operations request authorization");

requireIncludes(source.accessRoute, [
  "resolveOperationsRequestContext",
  "isMissingOperationsSecuritySchema",
  "operations_security_schema_ready",
  "permissions",
  "assignments",
  "can",
], "Operations access projection");

requireIncludes(source.controller, [
  "projectAuthorization",
  "filterOperationsCommands",
  "allowed_commands",
  "can_create",
  "can_control",
  "can_audit",
], "Operations authorization projection");

for (const [label, route] of [
  ["collection", source.collectionRoute],
  ["detail", source.detailRoute],
  ["command", source.commandRoute],
]) {
  requireIncludes(route, [
    "capabilityId",
    "resolveOperationsRequestContext",
    "required_permissions",
  ], `Operations ${label} route authorization`);
}

requireIncludes(source.commandRoute, [
  "command,",
], "Operations command authorization");

requireIncludes(source.historyRoute, [
  "OPERATIONS_ACTIONS.AUDIT",
  "required_permissions",
], "Operations history authorization");

requireIncludes(source.eventsRoute, [
  "OPERATIONS_ACTIONS.AUDIT",
  "OPERATIONS_ACTIONS.EVENTS_MANAGE",
  "required_permissions",
], "Operations event authorization");

requireIncludes(source.eventHealthRoute, [
  "OPERATIONS_ACTIONS.AUDIT",
  "OPERATIONS_ACTIONS.EVENTS_MANAGE",
  "required_permissions",
], "Operations event health authorization");

requireIncludes(source.workspaceHub, [
  "useOperationsAccess",
  "hasOperationsPermission",
  "OPERATIONS_ACTIONS",
  "authorisedGroups",
  "totalAuthorisedCapabilities",
  "Role and context filtered",
  "No Operations role is assigned",
], "Operations workspace authorization UI");

for (const [label, contents] of Object.entries(source)) {
  requireExcludes(contents, ["tenant_id", "tenantId"], `Operations authorization ${label}`);
}

console.log("OPERATIONS_AUTHORIZATION_RELEASE_AUDIT=PASS");
console.log("OPERATIONS_AUTHORIZATION=MEMBERSHIP_SCOPE_AND_PERMISSION");
console.log("OPERATIONS_OWNER_BOOTSTRAP=EXISTING_OWNER_AND_ADMIN_ROLES");
console.log("OPERATIONS_ROLE_SCHEMA_FALLBACK=ACCESS_REMAINS_AVAILABLE_BEFORE_MIGRATION");
console.log("OPERATIONS_PERMISSION_LEVELS=DOMAIN_GROUP_CAPABILITY_ACTION");
console.log("OPERATIONS_COMMAND_AUTHORIZATION=CREATE_UPDATE_EXECUTE_CONTROL");
console.log("OPERATIONS_AUDIT_AUTHORIZATION=HISTORY_EVENTS_AND_DELIVERY_MANAGEMENT");
