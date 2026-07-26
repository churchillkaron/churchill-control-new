import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STAFF_TABLE = "staff_accounts";

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

function staffPermissions(staff = {}) {
  const values = [
    staff.permissions,
    staff.permission_keys,
    staff.role_permissions,
    staff.access_permissions,
    staff.scopes,
    staff.metadata?.permissions,
    staff.metadata?.permission_keys,
    staff.role?.permissions,
  ].flatMap((value) => permissionValues(value));

  return [...new Set(values.map(normalizePermission).filter(Boolean))];
}

function permissionMatches(granted, required) {
  const normalizedGranted = normalizePermission(granted);
  const normalizedRequired = normalizePermission(required);
  if (!normalizedGranted || !normalizedRequired) return false;
  if (normalizedGranted === "*" || normalizedGranted === normalizedRequired) {
    return true;
  }
  if (normalizedGranted.endsWith(".*")) {
    const prefix = normalizedGranted.slice(0, -1);
    return normalizedRequired.startsWith(prefix);
  }
  return false;
}

function hasPermission(permissions, required) {
  return permissions.some((granted) => permissionMatches(granted, required));
}

function accountActive(staff = {}) {
  if (staff.archived === true) return false;
  if (staff.active === false || staff.is_active === false || staff.enabled === false) {
    return false;
  }
  const status = String(staff.status || "").trim().toUpperCase();
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
  ]
    .map(normalizeId)
    .filter(Boolean);
}

function requestHeaders(request) {
  if (request?.headers) return request.headers;
  try {
    return headers();
  } catch {
    return null;
  }
}

function bearerToken(request) {
  const value = requestHeaders(request)?.get?.("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function authenticatedUser(request) {
  const token = bearerToken(request);
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  let cookieStore;
  try {
    cookieStore = cookies();
  } catch {
    return null;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // Route access checks are read-only. Session refresh is handled by the auth boundary.
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
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

export async function requireOrganizationAccess({
  organizationId,
  organization_id,
  request = null,
  requiredPermission = null,
  requiredPermissions = null,
  requiredAnyPermission = null,
  userEmail = null,
  email = null,
} = {}) {
  const resolvedOrganizationId = normalizeId(organizationId || organization_id);
  if (!resolvedOrganizationId) {
    return denied(400, "Missing organizationId");
  }

  const user = await authenticatedUser(request);
  if (!user) {
    return denied(401, "Authentication required", resolvedOrganizationId);
  }

  const claimedEmail = normalizeEmail(userEmail || email);
  if (claimedEmail && claimedEmail !== normalizeEmail(user.email)) {
    return denied(403, "Authenticated user does not match requested identity", resolvedOrganizationId);
  }

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from(STAFF_TABLE)
    .select("*")
    .eq("auth_user_id", user.id)
    .limit(1000);

  if (staffError) {
    return denied(500, "Organization membership lookup failed", resolvedOrganizationId);
  }

  const staff = (staffRows || []).find((row) =>
    accountActive(row) &&
    staffMatchesUser(row, user) &&
    staffOrganizationIds(row).includes(resolvedOrganizationId)
  );

  if (!staff) {
    return denied(403, "Organization membership required", resolvedOrganizationId);
  }

  const permissions = staffPermissions(staff);
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

  const role =
    staff.role_key ||
    staff.role_code ||
    (typeof staff.role === "string" ? staff.role : staff.role?.key) ||
    staff.access_role ||
    null;

  return {
    success: true,
    status: 200,
    user: {
      id: user.id,
      email: user.email || null,
    },
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
      role,
      permissions,
    },
    staff,
    role,
    permissions,
  };
}
