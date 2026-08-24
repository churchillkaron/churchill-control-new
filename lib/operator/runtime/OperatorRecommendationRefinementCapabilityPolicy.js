function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function normalizedPermission(value) {
  return text(value, 240).toLowerCase();
}

function permissionMatches(granted, required) {
  const actual = normalizedPermission(granted);
  const needed = normalizedPermission(required);
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) return needed.startsWith(actual.slice(0, -1));
  return false;
}

export function evaluateRecommendationRefinementCapabilityForActor({
  capability = null,
  permissions = [],
  role = null,
  context = null,
} = {}) {
  const key = text(capability?.key, 240);
  const mode = text(capability?.mode, 40).toLowerCase();
  const scope = text(capability?.context_scope, 80).toLowerCase();
  const actorRole = text(role, 80).toUpperCase();
  const requiredPermissions = list(capability?.permissions)
    .map((permission) => text(permission, 240))
    .filter(Boolean);
  const fullAccess = FULL_ACCESS_ROLES.has(actorRole);
  const currentPermissions = list(permissions);

  let reason = null;
  if (!key) reason = "CAPABILITY_KEY_MISSING";
  else if (["read", "navigate"].includes(mode)) reason = "CAPABILITY_NOT_MUTATING_ACTION";
  else if (capability?.operator_enabled === false) reason = "CAPABILITY_OPERATOR_DISABLED";
  else if (
    scope === "entity" &&
    !text(context?.entityId ?? context?.entity_id, 160)
  ) {
    reason = "ENTITY_CONTEXT_REQUIRED";
  } else if (
    !fullAccess &&
    requiredPermissions.length &&
    !requiredPermissions.every((required) =>
      currentPermissions.some((granted) => permissionMatches(granted, required)),
    )
  ) {
    reason = "CURRENT_ACTOR_PERMISSION_DENIED";
  } else if (
    !fullAccess &&
    !requiredPermissions.length &&
    mode !== "read"
  ) {
    reason = "MUTATING_CAPABILITY_PERMISSION_CONTRACT_MISSING";
  } else if (
    capability?.auto_execute !== true &&
    capability?.requires_confirmation !== true
  ) {
    reason = "CAPABILITY_NOT_GOVERNED_FOR_OPERATOR_ACTION";
  }

  return {
    allowed: reason === null,
    reason,
    capability_key: key || null,
    actor_role: actorRole || null,
    full_access_role: fullAccess,
    required_permissions: requiredPermissions,
    context_scope: scope || null,
    current_actor_revalidated: reason === null,
    authorization_effect: "NONE",
    execution_authorized: false,
    recommendation_binding_created: false,
    pending_execution_created: false,
    autonomous_run_created: false,
  };
}

export function filterRecommendationRefinementCapabilitiesForActor({
  capabilities = [],
  permissions = [],
  role = null,
  context = null,
} = {}) {
  return list(capabilities).filter(
    (capability) =>
      evaluateRecommendationRefinementCapabilityForActor({
        capability,
        permissions,
        role,
        context,
      }).allowed,
  );
}

export default evaluateRecommendationRefinementCapabilityForActor;
