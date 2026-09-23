const FULL_ROLES = new Set([
  "OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN", "ADMIN",
  "MANAGER", "GENERAL_MANAGER", "OPERATIONS_MANAGER", "SERVICE_MANAGER", "FIELD_SERVICE_MANAGER", "SUPERVISOR",
]);

const TECHNICIAN_ROLES = new Set([
  "TECHNICIAN", "FIELD_TECHNICIAN", "SERVICE_TECHNICIAN", "OPERATOR", "PEST_CONTROL_TECHNICIAN",
]);

function normalize(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function permissionMatches(granted, required) {
  const actual = String(granted || "").trim().toLowerCase();
  const expected = String(required || "").trim().toLowerCase();
  if (!actual || !expected) return false;
  if (actual === "*" || actual === expected) return true;
  if (actual.endsWith(".*")) return expected.startsWith(actual.slice(0, -1));
  return false;
}

function roleCandidates(access = {}) {
  return new Set([
    access.role,
    access.access?.role,
    access.staff?.role,
    access.staff?.position,
    access.staff?.department,
  ].map(normalize).filter(Boolean));
}

function permissionsOf(access = {}) {
  return [
    ...(Array.isArray(access.permissions) ? access.permissions : []),
    ...(Array.isArray(access.access?.permissions) ? access.access.permissions : []),
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
}

function hasAnyPermission(access, required) {
  return permissionsOf(access).some((granted) => required.some((candidate) => permissionMatches(granted, candidate)));
}

export function canExecuteServiceWork(access) {
  const roles = roleCandidates(access);
  if ([...roles].some((role) => FULL_ROLES.has(role) || TECHNICIAN_ROLES.has(role))) return true;
  return hasAnyPermission(access, [
    "service_management.*", "service-management.*", "field_service.*", "field-service.*",
    "operations.field_service.*", "operations.field-service.*", "pest_control.*", "pest-control.*",
  ]);
}

export function canManageServiceWork(access) {
  const roles = roleCandidates(access);
  if ([...roles].some((role) => FULL_ROLES.has(role))) return true;
  return hasAnyPermission(access, [
    "service_management.manage", "service-management.manage", "field_service.manage", "field-service.manage",
    "operations.field_service.manage", "operations.field-service.manage", "pest_control.manage", "pest-control.manage",
  ]);
}

export function assertServiceManagementAccess({ access, mode = "EXECUTE" } = {}) {
  const normalized = normalize(mode);
  const allowed = normalized === "MANAGE" ? canManageServiceWork(access) : canExecuteServiceWork(access);
  if (allowed) return true;
  const error = new Error(normalized === "MANAGE" ? "Field service management access denied" : "Field service operational access denied");
  error.status = 403;
  throw error;
}

export function serviceManagementModeForRequest(request) {
  const method = String(request?.method || "GET").toUpperCase();
  let pathname = "";
  try { pathname = new URL(request.url).pathname; } catch { pathname = ""; }

  const managementPrefixes = [
    "/api/service-management/execution-templates",
    "/api/service-management/plans",
    "/api/service-management/assignment-candidates",
    "/api/service-management/treatment-catalog",
  ];
  if (managementPrefixes.some((prefix) => pathname.startsWith(prefix))) return "MANAGE";
  if (pathname.includes("/reports/") && method !== "GET") return "MANAGE";
  if (pathname.includes("/corrective-control") && method !== "GET") return "MANAGE";
  if (pathname.includes("/occurrences/") && pathname.endsWith("/reconcile")) return "MANAGE";
  return "EXECUTE";
}

export default Object.freeze({
  canExecuteServiceWork,
  canManageServiceWork,
  assertServiceManagementAccess,
  serviceManagementModeForRequest,
});
