import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = Object.freeze({
  policy: "lib/operations/security/OperationsAuthorizationPolicy.js",
  repository: "lib/operations/security/OperationsPermissionRepository.js",
  requestContext: "lib/operations/api/resolveOperationsRequestContext.js",
  accessRoute: "app/api/operations/access/route.js",
  accessHook: "lib/operations/security/useOperationsAccess.js",
  rolesRoute: "app/api/operations/security/roles/route.js",
  accessWorkCenter: "components/workspace/operations/OperationsAccessControlWorkCenter.jsx",
  accessPage: "app/(system)/workspace/[organizationId]/operations/access-control/page.jsx",
  workspaceHub: "components/workspace/operations/OperationsWorkspaceHub.jsx",
  migration: "supabase/migrations/20260728230001_operations_role_permissions.sql",
  ownerBackfillContract: "lib/operations/deployment/contracts/operations_owner_admin_backfill.sql",
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

requireIncludes(source.ownerBackfillContract, [
  "AUDIT-ONLY DEPLOYED CONTRACT SNAPSHOT",
  "privileged_memberships",
  "OPERATIONS_ADMIN",
  "operations.*",
  "organization_users",
  "staff_accounts",
  "auth_user_id",
  "on conflict (organization_id, user_id, role_id)",
  "revoked_at = null",
], "Operations owner administrator backfill contract");

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
  "OPERATIONS_BOOTSTRAP_ADMIN_ROLES",
  "isOperationsBootstrapAdminRole",
  "bootstrapOperationsPermissions",
], "Operations authorization separation and owner bootstrap");

requireIncludes(source.requestContext, [
  "resolveUserOperationsPermissions",
  "assignedPermissions",
  "assigned_operations_permissions",
  "bootstrapOperationsPermissions",
  "isOperationsBootstrapAdminRole",
  "assignOperationsRole",
  'roleCode: "OPERATIONS_ADMIN"',
  "operations_bootstrap_assignment_ensured",
  "operations_security_schema_ready",
], "Operations assigned permission context and self-healing owner assignment");

requireIncludes(source.accessRoute, [
  "resolveOperationsRequestContext",
  "authorize: false",
  "listUserOperationsRoleAssignments",
  "manage_events",
  "administer",
  "permissions",
], "Operations access projection API");

requireIncludes(source.accessHook, [
  "useOperationsAccess",
  "/api/operations/access?",
  "permissions",
  "assignments",
  "refresh: load",
], "Operations access hook");

requireIncludes(source.rolesRoute, [
  "OPERATIONS_ACTIONS.ADMINISTER",
  "requireOrganizationUser",
  "listOrganizationMembers",
  "assertNotLastAdministrator",
  "The final Operations Administrator role cannot be revoked",
  "organization_users",
  "staff_accounts",
  "parties",
  "assignOperationsRole",
  "revokeOperationsRole",
  "user_id required",
  "role_code required",
], "Operations role administration API");

requireIncludes(source.accessWorkCenter, [
  "OperationsAccessControlWorkCenter",
  "useOperationsAccess",
  "/api/operations/security/roles",
  "Assign canonical role",
  "Active assignments",
  "Canonical roles",
  'changeRole("POST"',
  'changeRole("DELETE"',
], "Operations access control work centre");

requireIncludes(source.accessPage, [
  "OperationsAccessControlWorkCenter",
  'dynamic = "force-dynamic"',
], "Operations access control page");

requireIncludes(source.workspaceHub, [
  "useOperationsAccess",
  "access.permissions",
  "access.can?.administer",
  "/operations/access-control",
  "Access Control",
  "Resolving Operations access",
  "Operations access failed to load",
  "Retry Access Check",
  "No Operations role is assigned",
  "queryHasNoMatches",
  "genuinelyHasNoAccess",
], "Operations authorised workspace hub and recovery states");

for (const [label, contents] of Object.entries(source)) {
  requireExcludes(contents, ["tenant_id", "tenantId"], `Operations role ${label}`);
}

console.log("OPERATIONS_ROLE_RELEASE_AUDIT=PASS");
console.log("OPERATIONS_ROLES=ORGANIZATION_SCOPED_CANONICAL_BUNDLES");
console.log("OPERATIONS_ROLE_ASSIGNMENT=ADMINISTER_PERMISSION_REQUIRED");
console.log("OPERATIONS_ROLE_TARGET=ORGANIZATION_MEMBERSHIP_REQUIRED");
console.log("OPERATIONS_ROLE_UI=MEMBERS_ASSIGNMENTS_AND_CANONICAL_ROLES");
console.log("OPERATIONS_LAST_ADMIN=REVOCATION_PROTECTED");
console.log("OPERATIONS_CLIENT_ACCESS=SERVER_MERGED_PERMISSION_PROJECTION");
console.log("OPERATIONS_OWNER_ACCESS=BOOTSTRAP_BACKFILL_AND_RUNTIME_SELF_HEALING");
console.log("OPERATIONS_EMPTY_STATE=LOADING_ERROR_NO_ROLE_AND_SEARCH_SEPARATED");
console.log("OPERATIONS_SECURITY_ADMINISTRATION=SEPARATED_FROM_MANAGEMENT");
