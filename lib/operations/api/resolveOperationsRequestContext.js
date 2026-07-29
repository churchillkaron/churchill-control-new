import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import {
  authorizeOperationsAccess,
  bootstrapOperationsPermissions,
  isOperationsBootstrapAdminRole,
  OPERATIONS_ACTIONS,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import {
  assignOperationsRole,
  resolveUserOperationsPermissions,
} from "@/lib/operations/security/OperationsPermissionRepository";

function value(source, camel, snake) {
  return source?.[camel] || source?.[snake] || null;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function isMissingOperationsSecuritySchema(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01"
    || code === "PGRST205"
    || /operations_(roles|role_permissions)|user_operations_roles/i.test(message);
}

export async function resolveOperationsRequestContext({
  request,
  input = {},
  capabilityId = null,
  action = OPERATIONS_ACTIONS.VIEW,
  command = null,
  authorize = true,
}) {
  const resolved = await resolveBusinessContext({
    organizationId: value(input, "organizationId", "organization_id"),
    entityId: value(input, "entityId", "entity_id"),
    periodId: value(input, "periodId", "period_id"),
    request,
  });

  if (!resolved.success) return resolved;

  const organizationRole = resolved.role || resolved.access?.role || null;
  const bootstrapAdministrator = isOperationsBootstrapAdminRole(organizationRole);
  let assignedPermissions = [];
  let securitySchemaReady = true;
  let bootstrapAssignmentEnsured = false;

  if (resolved.user?.id) {
    try {
      assignedPermissions = await resolveUserOperationsPermissions({
        organizationId: resolved.organizationId,
        userId: resolved.user.id,
      });

      if (bootstrapAdministrator && !assignedPermissions.includes("operations.*")) {
        await assignOperationsRole({
          organizationId: resolved.organizationId,
          userId: resolved.user.id,
          roleCode: "OPERATIONS_ADMIN",
          assignedBy: resolved.user.id,
        });
        assignedPermissions = unique([...assignedPermissions, "operations.*"]);
        bootstrapAssignmentEnsured = true;
      }
    } catch (error) {
      if (!isMissingOperationsSecuritySchema(error)) throw error;
      securitySchemaReady = false;
    }
  }

  const permissions = unique(bootstrapOperationsPermissions({
    permissions: [
      ...(resolved.permissions || []),
      ...assignedPermissions,
    ],
    role: organizationRole,
  }));

  const authorization = authorizeOperationsAccess({
    permissions,
    capabilityId,
    action,
    command,
  });

  if (authorize && !authorization.allowed) {
    return {
      success: false,
      status: 403,
      error: "Operations permission required",
      authorization,
      required_permissions: authorization.required_permissions,
    };
  }

  return {
    success: true,
    access: resolved.access,
    user: resolved.user,
    authorization,
    assigned_operations_permissions: assignedPermissions,
    operations_security_schema_ready: securitySchemaReady,
    operations_bootstrap_assignment_ensured: bootstrapAssignmentEnsured,
    context: {
      organization_id: resolved.organizationId,
      entity_id: resolved.entityId,
      period_id: resolved.periodId,
      country: resolved.country,
      currency: resolved.currency,
      locale: resolved.locale,
      timezone: resolved.timezone,
      permissions,
      role: organizationRole,
      actor_id: resolved.user?.id || null,
      operations_security_schema_ready: securitySchemaReady,
      operations_bootstrap_assignment_ensured: bootstrapAssignmentEnsured,
    },
  };
}

export function searchParamsToObject(searchParams) {
  return Object.fromEntries(searchParams.entries());
}

export default resolveOperationsRequestContext;
