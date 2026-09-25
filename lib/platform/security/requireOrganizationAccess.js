import crypto from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STAFF_TABLE = "staff_accounts";
const MEMBERSHIP_TABLE = "organization_users";
const ACCESS_HOT_CACHE_TTL_MS = 10 * 1000;
const LOCAL_CODE_ACCESS_HOT_CACHE_TTL_MS = 60 * 1000;
const ACCESS_NETWORK_TIMEOUT_MS = 5000;
const ACCESS_HOT_CACHE_MAX_ENTRIES = 256;
const ACCESS_HOT_CACHE_GLOBAL_KEY = "__avantiqo_organization_access_hot_cache_v1__";
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function accessHotCache() {
  if (!(globalThis[ACCESS_HOT_CACHE_GLOBAL_KEY] instanceof Map)) {
    globalThis[ACCESS_HOT_CACHE_GLOBAL_KEY] = new Map();
  }
  return globalThis[ACCESS_HOT_CACHE_GLOBAL_KEY];
}

function requestCredentialFingerprint(request) {
  const source = requestHeaders(request);
  const authorization = source?.get?.("authorization") || "";
  const cookie = source?.get?.("cookie") || "";
  if (!authorization && !cookie) return null;
  return crypto
    .createHash("sha256")
    .update(`${authorization}\n${cookie}`, "utf8")
    .digest("hex");
}

function accessHotCacheKey({
  request,
  organizationId,
  requiredPermission,
  requiredPermissions,
  requiredAnyPermission,
  claimedEmail,
}) {
  const fingerprint = requestCredentialFingerprint(request);
  if (!fingerprint) return null;
  const allRequired = [
    requiredPermission,
    ...(Array.isArray(requiredPermissions) ? requiredPermissions : []),
  ].map(normalizePermission).filter(Boolean).sort();
  const anyRequired = (Array.isArray(requiredAnyPermission)
    ? requiredAnyPermission
    : requiredAnyPermission
      ? [requiredAnyPermission]
      : []
  ).map(normalizePermission).filter(Boolean).sort();
  return JSON.stringify({
    fingerprint,
    organization_id: organizationId,
    all_required: allRequired,
    any_required: anyRequired,
    claimed_email: normalizeEmail(claimedEmail) || null,
  });
}

function loadAccessHotCache(key, ttlMs = ACCESS_HOT_CACHE_TTL_MS) {
  if (!key) return null;
  const cache = accessHotCache();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - Number(entry.cached_at || 0) > Math.max(1000, Number(ttlMs) || ACCESS_HOT_CACHE_TTL_MS)) {
    cache.delete(key);
    return null;
  }
  return entry.value || null;
}

function storeAccessHotCache(key, value) {
  if (!key || !value?.success) return;
  const cache = accessHotCache();
  if (cache.size >= ACCESS_HOT_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, {
    cached_at: Date.now(),
    value,
  });
}

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
  const values = [
    subject.permissions,
    subject.permission_keys,
    subject.role_permissions,
    subject.access_permissions,
    subject.scopes,
    subject.metadata?.permissions,
    subject.metadata?.permission_keys,
    subject.role?.permissions,
  ].flatMap((value) => permissionValues(value));

  return values.map(normalizePermission).filter(Boolean);
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
    const prefix = normalizedGranted.slice(0, -1);
    return normalizedRequired.startsWith(prefix);
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

function localCodeAccessRequest(request) {
  try {
    const url = new URL(request?.url || "");
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    return localHost && url.pathname.startsWith("/api/operator/code/");
  } catch {
    return false;
  }
}

function bearerToken(request) {
  const value = requestHeaders(request)?.get?.("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function accessTimeoutSignal() {
  return AbortSignal.timeout(ACCESS_NETWORK_TIMEOUT_MS);
}

function boundedAccessFetch(input, init = {}) {
  const signal = init?.signal
    ? AbortSignal.any([init.signal, accessTimeoutSignal()])
    : accessTimeoutSignal();
  return fetch(input, { ...init, signal });
}

async function authenticatedUser(request) {
  const token = bearerToken(request);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  if (token) {
    const response = await boundedAccessFetch(`${url}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user?.id ? user : null;
  }

  let cookieStore;
  try {
    cookieStore = cookies();
  } catch {
    return null;
  }

  const supabase = createServerClient(url, anonKey, {
    global: {
      fetch: boundedAccessFetch,
    },
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
  user: suppliedUser = null,
} = {}) {
  const resolvedOrganizationId = normalizeId(organizationId || organization_id);
  if (!resolvedOrganizationId) {
    return denied(400, "Missing organizationId");
  }

  const claimedEmail = normalizeEmail(userEmail || email);
  const hotCacheKey = accessHotCacheKey({
    request,
    organizationId: resolvedOrganizationId,
    requiredPermission,
    requiredPermissions,
    requiredAnyPermission,
    claimedEmail,
  });
  const hotCacheTtlMs = localCodeAccessRequest(request)
    ? LOCAL_CODE_ACCESS_HOT_CACHE_TTL_MS
    : ACCESS_HOT_CACHE_TTL_MS;
  const hotCached = loadAccessHotCache(hotCacheKey, hotCacheTtlMs);
  if (hotCached?.success === true) {
    return {
      ...hotCached,
      access_hot_cache_hit: true,
    };
  }

  const user = suppliedUser?.id ? suppliedUser : await authenticatedUser(request);
  if (!user) {
    return denied(401, "Authentication required", resolvedOrganizationId);
  }

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
    .limit(1000)
    .abortSignal(accessTimeoutSignal());

  if (staffError) {
    return denied(500, "Organization membership lookup failed", resolvedOrganizationId);
  }

  const matchingStaff = (staffRows || []).filter((row) =>
    recordActive(row) && staffMatchesUser(row, user)
  );
  const staffIds = matchingStaff.map((row) => normalizeId(row.id)).filter(Boolean);

  let membershipRows = [];
  if (staffIds.length) {
    const { data, error } = await supabaseAdmin
      .from(MEMBERSHIP_TABLE)
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .in("staff_account_id", staffIds)
      .limit(1000)
      .abortSignal(accessTimeoutSignal());

    if (error) {
      return denied(500, "Organization membership lookup failed", resolvedOrganizationId);
    }
    membershipRows = (data || []).filter(recordActive);
  }

  const membershipByStaffId = new Map(
    membershipRows.map((row) => [normalizeId(row.staff_account_id), row]),
  );
  const staff = matchingStaff.find((row) =>
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

  const granted = {
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
      organizationUserId: membership?.id || null,
      role,
      permissions,
    },
    staff,
    membership,
    role,
    permissions,
    access_hot_cache_hit: false,
  };
  storeAccessHotCache(hotCacheKey, granted);
  return granted;
}
