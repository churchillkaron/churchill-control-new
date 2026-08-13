import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeRole(value) {
  return text(value).toUpperCase();
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

  const status = text(record.status).toUpperCase();
  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
    "REVOKED",
  ].includes(status);
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
    .map((value) => text(value).toLowerCase())
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
  const values = [
    ...permissionSet(staff),
    ...permissionSet(membership),
  ];

  if (FULL_ACCESS_ROLES.has(normalizeRole(resolvedRole(staff, membership)))) {
    values.push("*");
  }

  return [...new Set(values)];
}

export async function resolveDelegatedOrganizationAccess({
  organizationId,
  userId,
} = {}) {
  const resolvedOrganizationId = text(organizationId);
  const resolvedUserId = text(userId);

  if (!resolvedOrganizationId) throw new Error("organizationId required");
  if (!resolvedUserId) throw new Error("Delegated automation creator is missing");

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("auth_user_id", resolvedUserId)
    .limit(1000);

  if (staffError) throw staffError;

  const activeStaff = (staffRows || []).filter(recordActive);
  if (!activeStaff.length) {
    throw new Error("Automation creator no longer has an active staff account");
  }

  const staffIds = activeStaff.map((row) => row.id).filter(Boolean);
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .in("staff_account_id", staffIds)
    .limit(1000);

  if (membershipError) throw membershipError;

  const activeMemberships = (memberships || []).filter(recordActive);
  const membershipByStaffId = new Map(
    activeMemberships.map((row) => [String(row.staff_account_id), row]),
  );

  const staff = activeStaff.find((row) =>
    String(row.organization_id || "") === resolvedOrganizationId ||
    String(row.active_organization_id || "") === resolvedOrganizationId ||
    membershipByStaffId.has(String(row.id)),
  );

  if (!staff) {
    throw new Error("Automation creator no longer has organization access");
  }

  const membership = membershipByStaffId.get(String(staff.id)) || {};
  const role = resolvedRole(staff, membership);
  const permissions = resolvedPermissions(staff, membership);
  const partyId = staff.party_id || staff.partyId || null;

  if (!partyId) throw new Error("Automation creator is not linked to a party");

  return {
    organizationId: resolvedOrganizationId,
    userId: resolvedUserId,
    staff,
    membership,
    partyId,
    role,
    permissions,
    actor: {
      id: resolvedUserId,
      partyId,
      party_id: partyId,
      staffAccountId: staff.id || null,
      role,
      delegated: true,
    },
  };
}
