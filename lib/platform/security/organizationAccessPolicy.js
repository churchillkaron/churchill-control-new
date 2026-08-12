import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import saveOperationalSettings from "@/lib/settings/saveOperationalSettings";

const RECOVERY_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

const WORKSPACE_ROLES = new Set([
  ...RECOVERY_ROLES,
  "ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "FINANCE",
  "HR",
  "HUMAN_RESOURCES",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function explicitBoolean(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function optionalNonNegativeInteger(value, label) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative whole number or left blank`);
  }

  return parsed;
}

export async function loadOrganizationPolicy({ organizationId }) {
  if (!organizationId) throw new Error("organizationId required");

  const [access, workforce] = await Promise.all([
    loadOperationalSettings({ organizationId, domain: "ACCESS" }),
    loadOperationalSettings({ organizationId, domain: "WORKFORCE" }),
  ]);

  return {
    access: {
      ...access,
      organization_access_enabled: explicitBoolean(
        access?.organization_access_enabled,
        true
      ),
      staff_portal_enabled: explicitBoolean(access?.staff_portal_enabled, true),
    },
    workforce: {
      ...workforce,
      early_clock_in_minutes:
        workforce?.early_clock_in_minutes ?? null,
      late_threshold_minutes:
        workforce?.late_threshold_minutes ?? null,
    },
  };
}

export async function saveOrganizationPolicy({
  organizationId,
  access = {},
  workforce = {},
}) {
  if (!organizationId) throw new Error("organizationId required");

  const current = await loadOrganizationPolicy({ organizationId });

  const nextAccess = {
    ...current.access,
    organization_access_enabled: Boolean(access.organization_access_enabled),
    staff_portal_enabled: Boolean(access.staff_portal_enabled),
  };

  const nextWorkforce = {
    ...current.workforce,
    early_clock_in_minutes: optionalNonNegativeInteger(
      workforce.early_clock_in_minutes,
      "Early clock-in minutes"
    ),
    late_threshold_minutes: optionalNonNegativeInteger(
      workforce.late_threshold_minutes,
      "Late threshold minutes"
    ),
  };

  const [savedAccess, savedWorkforce] = await Promise.all([
    saveOperationalSettings({
      organizationId,
      domain: "ACCESS",
      settings: nextAccess,
    }),
    saveOperationalSettings({
      organizationId,
      domain: "WORKFORCE",
      settings: nextWorkforce,
    }),
  ]);

  return {
    access: savedAccess?.settings || nextAccess,
    workforce: savedWorkforce?.settings || nextWorkforce,
  };
}

export async function evaluateOrganizationAppAccess({ organizationId, role }) {
  const policy = await loadOrganizationPolicy({ organizationId });
  const normalizedRole = normalizeRole(role);
  const recoveryAccess = RECOVERY_ROLES.has(normalizedRole);
  const workspaceRole = WORKSPACE_ROLES.has(normalizedRole);

  if (!policy.access.organization_access_enabled && !recoveryAccess) {
    return {
      allowed: false,
      code: "ORGANIZATION_APP_ACCESS_DISABLED",
      reason: "Organization app access is disabled",
      policy,
    };
  }

  if (!workspaceRole && !policy.access.staff_portal_enabled && !recoveryAccess) {
    return {
      allowed: false,
      code: "STAFF_PORTAL_ACCESS_DISABLED",
      reason: "Staff portal access is disabled",
      policy,
    };
  }

  return {
    allowed: true,
    code: null,
    reason: null,
    policy,
  };
}

export { RECOVERY_ROLES, WORKSPACE_ROLES };
