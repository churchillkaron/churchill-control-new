function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function permissionMatches(granted, required) {
  const actual = normalize(granted);
  const needed = normalize(required);

  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) {
    return needed.startsWith(actual.slice(0, -1));
  }

  return false;
}

export function executionContextHasPermission(context = {}, requiredPermission) {
  const required = normalize(requiredPermission);
  if (!required) return false;

  const permissions = Array.isArray(context.permissions)
    ? context.permissions
    : [];

  return permissions.some((granted) => permissionMatches(granted, required));
}

export function requireExecutionPermission(context, requiredPermission) {
  if (executionContextHasPermission(context, requiredPermission)) return true;

  const error = new Error("CAPABILITY_PERMISSION_REQUIRED");
  error.status = 403;
  error.requiredPermission = requiredPermission;
  throw error;
}

export default requireExecutionPermission;
