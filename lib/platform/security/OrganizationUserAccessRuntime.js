import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STAFF_TABLE = "staff_accounts";
const MEMBERSHIP_TABLE = "organization_users";
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") {
    return null;
  }
  return normalized;
}

function normalizeEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function normalizePermission(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRole(value) {
  return String(value ?? "").trim().toUpperCase();
}

function permissionValues(value, prefix = "") {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => permissionValues(entry, prefix));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (entry === true) return [path];
      if (entry === false || entry === null || entry === undefined) return [];
      return permissionValues(entry, path);
    });
  }
  if (typeof value === "string") {
    return value
      .split(/[\s,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => (prefix ? `${prefix}.${entry}` : entry));
  }
  return [];
}

function permissionSet(subject = {}) {
  return [
    subject.permissions,
    subject.permission_keys,
    subject.role_permissions,
    subject.access_permissions,
    subject.scopes,
    subject.metadata?.permissions,
    subject.metadata?.permission_keys,
    subject.role?.permissions,
  ]
    .flatMap((value) => permissionValues(value))
    .map(normalizePermission)
    .filter(Boolean);
}

function resolvedRole(staff = {}, membership = {}) {
  return (
    membership.role_key ||
    membership.role_code ||
    (typeof membership.role === "string" ? membership.role : membership.role?.key) ||
    membership.access_role ||
    staff.role_key ||
    staff.role_code ||
    (typeof staff.role === "string" ? staff.role : staff.role?.key) ||
    staff.access_role ||
    null
  );
}

function resolvedPermissions(staff = {}, membership = {}) {
  const role = normalizeRole(resolvedRole(staff, membership));
  const values = [
    ...permissionSet(staff),
    ...permissionSet(membership),
  ];
  if (FULL_ACCESS_ROLES.has(role)) values.push("*");
  return [...new Set(values)];
}

function permissionMatches(granted, required) {
  const normalizedGranted = normalizePermission(granted);
  const normalizedRequired = normalizePermission(required);
  if (!normalizedGranted || !normalizedRequired) return false;
  if (normalizedGranted === "*" || normalizedGranted === normalizedRequired) {
    return true;
  }
  if (normalizedGranted.endsWith(".*")) {
    return normalizedRequired.startsWith(normalizedGranted.slice(0, -1));
  }
  return false;
}

function hasPermission(permissions, required) {
  return permissions.some((granted) => permissionMatches(granted, required));
}

function recordActive(record = {}) {
  if (record.archived === true) return false;
  if (
    record.active === false ||
    record.is_active === false ||
    record.enabled === false
  ) {
    return false;
  }
  const status = String(record.status || "").trim().toUpperCase();
  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
    "REVOKED",
  ].includes(status);
}

function staffMatchesUser(staff, user) {
  const userId = normalizeId(user?.id);
  const userEmail = normalizeEmail(user?.email);
  const ids = [
    staff.user_id,
    staff.auth_user_id,
    staff.supabase_user_id,
    staff.profile_id,
    staff.account_user_id,
    staff.id,
  ].map(normalizeId).filter(Boolean);
  const emails = [
    staff.email,
    staff.user_email,
    staff.auth_email,
    staff.login_email,
  ].map(normalizeEmail).filter(Boolean);
  return Boolean(
    (userId && ids.includes(userId)) ||
    (userEmail && emails.includes(userEmail))
  );
}

function staffOrganizationIds(staff = {}) {
  return [
    staff.organization_id,
    staff.active_organization_id,
    staff.organization?.id,
    staff.metadata?.organization_id,
    staff.metadata?.active_organization_id,
  ].map(normalizeId).filter(Boolean);
}

function denied(status, error, organizationId = null) {
  return {
    success: false,
    status,
    error,
    organizationId,
    organization_id: organizationId,
  };
}

export async function resolveOrganizationUserAccess({
  organizationId,
  organization_id,
  user,
  requiredPermission = null,
  requiredPermissions = null,
  requiredAnyPermission = null,
  userEmail = null,
  email = null,
} = {}) {
  const resolvedOrganizationId = normalizeId(organizationId || organization_id);
  if (!resolvedOrganizationId) return denied(400, "Missing organizationId");
  if (!user?.id) return denied(401, "Authentication required", resolvedOrganizationId);

  const claimedEmail = normalizeEmail(userEmail || email);
  if (claimedEmail && claimedEmail !== normalizeEmail(user.email)) {
    return denied(
      403,
      "Authenticated user does not match requested identity",
      resolvedOrganizationId,
    );
  }

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from(STAFF_TABLE)
    .select("*")
    .eq("auth_user_id", user.id)
    .limit(1000);
  if (staffError) {
    return denied(500, "Organization membership lookup failed", resolvedOrganizationId);
  }

  const matchingStaff = (staffRows || []).filter((row) =>
    recordActive(row) && staffMatchesUser(row, user)
  );
  const staffIds = matchingStaff.map((row) => normalizeId(row.id)).filter(Boolean);

  let membershipRows = [];
  if (staffIds.length) {
    const { data, error: membershipError } = await supabaseAdmin
      .from(MEMBERSHIP_TABLE)
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .in("staff_account_id", staffIds)
      .limit(1000);
    if (membershipError) {
      return denied(500, "Organization membership lookup failed", resolvedOrganizationId);
    }
    membershipRows = (data || []).filter(recordActive);
  }

  const membershipByStaffId = new Map(
    membershipRows.map((row) => [normalizeId(row.staff_account_id), row]),
  );
  const staff = matchingStaff.find((row) =>
    staffOrganizationIds(row).includes(resolvedOrganizationId) ||
    membershipByStaffId.has(normalizeId(row.id))
  );
  if (!staff) {
    return denied(403, "Organization membership required", resolvedOrganizationId);
  }

  const membership = membershipByStaffId.get(normalizeId(staff.id)) || null;
  const role = resolvedRole(staff, membership || {});
  const permissions = resolvedPermissions(staff, membership || {});
  const allRequired = [
    requiredPermission,
    ...(Array.isArray(requiredPermissions) ? requiredPermissions : []),
  ].filter(Boolean);
  const anyRequired = Array.isArray(requiredAnyPermission)
    ? requiredAnyPermission.filter(Boolean)
    : requiredAnyPermission
      ? [requiredAnyPermission]
      : [];

  if (allRequired.some((permission) => !hasPermission(permissions, permission))) {
    return denied(403, "Required permission missing", resolvedOrganizationId);
  }
  if (
    anyRequired.length &&
    !anyRequired.some((permission) => hasPermission(permissions, permission))
  ) {
    return denied(403, "Required permission missing", resolvedOrganizationId);
  }

  return {
    success: true,
    status: 200,
    user: { id: user.id, email: user.email || null },
    userId: user.id,
    userEmail: user.email || null,
    organizationId: resolvedOrganizationId,
    organization_id: resolvedOrganizationId,
    organization: { id: resolvedOrganizationId },
    access: {
      authenticated: true,
      userId: user.id,
      userEmail: user.email || null,
      staffAccountId: staff.id || null,
      organizationUserId: membership?.id || null,
      role,
      permissions,
    },
    staff,
    membership,
    role,
    permissions,
  };
}

export const OrganizationUserAccessRuntime = {
  resolve: resolveOrganizationUserAccess,
};
