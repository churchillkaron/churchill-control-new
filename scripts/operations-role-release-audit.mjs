import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = Object.freeze({
  policy: "lib/operations/security/OperationsAuthorizationPolicy.js",
  repository: "lib/operations/security/OperationsPermissionRepository.js",
  requestContext: "lib/operations/api/resolveOperationsRequestContext.js",
  rolesRoute: "app/api/operations/security/roles/route.js",
  migration: "supabase/migrations/20260728230000_operations_role_permissions.sql",
});

function read(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Missing Operations role file: ${relativePath}`);
  }
  return fs.readFileSync(absolute, "utf8");
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
  Object.entries(FILES).map(([key, file]) => [key, read(file)]),
);

requireIncludes(source.migration, [
  "create table if not exists public.operations_roles",
  "create table if not exists public.operations_role_permissions",
  "create table if not exists public.user_operations_roles",
  "unique (organization_id, role_code)",
  "unique (organization_id, role_id, permission_key)",
  "unique (organization_id, user_id, role_id)",
  "revoked_at",
  "service_role",
], "Operations role migration");

requireIncludes(source.repository, [
  "CANONICAL_OPERATIONS_ROLES",
  "OPERATIONS_ADMIN",
  "OPERATIONS_MANAGER",
  "OPERATIONS_SUPERVISOR",
  "OPERATIONS_PLANNER",
  "OPERATIONS_OPERATOR",
  "OPERATIONS_AUDITOR",
  "OPERATIONS_VIEWER",
  "ensureCanonicalOperationsRoles",
  "resolveUserOperationsPermissions",
  "assignOperationsRole",
  "revokeOperationsRole",
  'onConflict: "organization_id,user_id,role_id"',
], "Operations role repository");

requireIncludes(source.policy, [
  "RESTRICTED_OVERRIDE_ACTIONS",
  "OPERATIONS_ACTIONS.ADMINISTER",
  "OPERATIONS_ACTIONS.EVENTS_MANAGE",
  "managementOverride",
], "Operations authorization separation");

requireIncludes(source.requestContext, [
  "resolveUserOperationsPermissions",
  "assignedPermissions",
  "assigned_operations_permissions",
  "permissions = unique",
], "Operations assigned permission context");

requireIncludes(source.rolesRoute, [
  "OPERATIONS_ACTIONS.ADMINISTER",
  "requireOrganizationUser",
  "organization_users",
  "staff_accounts",
  "assignOperationsRole",
  "revokeOperationsRole",
  "user_id required",
  "role_code required",
], "Operations role administration API");

for (const [label, contents] of Object.entries(source)) {
  requireExcludes(contents, ["tenant_id", "tenantId"], `Operations role ${label}`);
}

console.log("OPERATIONS_ROLE_RELEASE_AUDIT=PASS");
console.log("OPERATIONS_ROLES=ORGANIZATION_SCOPED_CANONICAL_BUNDLES");
console.log("OPERATIONS_ROLE_ASSIGNMENT=ADMINISTER_PERMISSION_REQUIRED");
console.log("OPERATIONS_ROLE_TARGET=ORGANIZATION_MEMBERSHIP_REQUIRED");
console.log("OPERATIONS_SECURITY_ADMINISTRATION=SEPARATED_FROM_MANAGEMENT");
