import { cookies } from "next/headers";

import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeId(value) {
  const normalized = String(value ?? "").trim();

  if (!normalized || normalized === "undefined" || normalized === "null") {
    return null;
  }

  return normalized;
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

function headerOrganizationId(request) {
  const headers = request?.headers;

  return normalizeId(
    headers?.get?.("x-avantiqo-organization-id") ||
      headers?.get?.("x-organization-id") ||
      null
  );
}

function queryOrganizationId(request) {
  if (!request?.url) return null;

  try {
    const url = new URL(request.url);

    return normalizeId(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id") ||
        null
    );
  } catch {
    return null;
  }
}

function refererOrganizationId(request) {
  const referer = request?.headers?.get?.("referer");
  if (!referer) return null;

  try {
    const pathname = new URL(referer).pathname;
    const match = pathname.match(/^\/workspace\/([^/]+)/);
    return match?.[1] ? normalizeId(decodeURIComponent(match[1])) : null;
  } catch {
    return null;
  }
}

function cookieOrganizationId() {
  try {
    const cookieStore = cookies();

    return normalizeId(
      cookieStore.get("avantiqo_active_organization_id")?.value ||
        cookieStore.get("active_organization_id")?.value ||
        null
    );
  } catch {
    return null;
  }
}

function metadataOrganizationId(user) {
  return normalizeId(
    user?.app_metadata?.active_organization_id ||
      user?.user_metadata?.active_organization_id ||
      null
  );
}

async function loadMembershipOrganizationIds(staffRows) {
  const staffIds = (staffRows || [])
    .map((row) => normalizeId(row.id))
    .filter(Boolean);

  if (!staffIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("organization_users")
    .select("*")
    .in("staff_account_id", staffIds)
    .limit(1000);

  if (error) throw error;

  return (data || [])
    .filter(recordActive)
    .map((row) => normalizeId(row.organization_id))
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function canonicalStaffOrganizationId(staffRows) {
  const explicitActive = (staffRows || [])
    .map((row) => normalizeId(row.active_organization_id))
    .find(Boolean);

  if (explicitActive) return explicitActive;

  const primary = (staffRows || []).find(
    (row) =>
      row.is_primary === true ||
      row.primary === true ||
      row.is_default === true ||
      row.default === true
  );

  return staffOrganizationIds(primary || {})[0] || null;
}

function failure({ status, error, code, availableOrganizationIds = [] }) {
  return {
    success: false,
    status,
    error,
    code,
    availableOrganizationIds,
  };
}

export default async function resolveAuthenticatedStaffContext({
  request = null,
  user: suppliedUser = null,
  organizationId: suppliedOrganizationId = null,
  requiredPermission = null,
  requiredPermissions = null,
  requiredAnyPermission = null,
} = {}) {
  const user = suppliedUser || (await getServerCurrentUser());

  if (!user?.id) {
    return failure({
      status: 401,
      error: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .limit(1000);

  if (staffError) {
    return failure({
      status: 500,
      error: "Unable to resolve staff identity",
      code: "STAFF_LOOKUP_FAILED",
    });
  }

  const activeStaffRows = (staffRows || []).filter(recordActive);

  if (!activeStaffRows.length) {
    return failure({
      status: 404,
      error: "Active staff account not found",
      code: "STAFF_NOT_FOUND",
    });
  }

  let membershipOrganizationIds = [];

  try {
    membershipOrganizationIds = await loadMembershipOrganizationIds(activeStaffRows);
  } catch {
    membershipOrganizationIds = [];
  }

  const availableOrganizationIds = uniqueSorted([
    ...activeStaffRows.flatMap(staffOrganizationIds),
    ...membershipOrganizationIds,
  ]);

  if (!availableOrganizationIds.length) {
    return failure({
      status: 409,
      error: "Staff organization not configured",
      code: "ORGANIZATION_MISSING",
    });
  }

  const explicitOrganizationId = normalizeId(suppliedOrganizationId);
  const requestOrganizationId =
    headerOrganizationId(request) ||
    queryOrganizationId(request) ||
    refererOrganizationId(request);
  const persistedOrganizationId =
    cookieOrganizationId() || metadataOrganizationId(user);
  const staffOrganizationId = canonicalStaffOrganizationId(activeStaffRows);

  const preferredOrganizationId =
    explicitOrganizationId ||
    requestOrganizationId ||
    persistedOrganizationId ||
    staffOrganizationId ||
    (availableOrganizationIds.length === 1 ? availableOrganizationIds[0] : null);

  if (!preferredOrganizationId && availableOrganizationIds.length > 1) {
    return failure({
      status: 409,
      error: "Select an organization before continuing",
      code: "ORGANIZATION_SELECTION_REQUIRED",
      availableOrganizationIds,
    });
  }

  if (!availableOrganizationIds.includes(preferredOrganizationId)) {
    return failure({
      status: 403,
      error: "Selected organization is not available to this user",
      code: "ORGANIZATION_ACCESS_DENIED",
      availableOrganizationIds,
    });
  }

  const access = await requireOrganizationAccess({
    organizationId: preferredOrganizationId,
    request,
    requiredPermission,
    requiredPermissions,
    requiredAnyPermission,
  });

  if (!access.success) {
    return failure({
      status: access.status || 403,
      error: access.error || "Organization membership required",
      code: "ORGANIZATION_ACCESS_DENIED",
      availableOrganizationIds,
    });
  }

  return {
    success: true,
    status: 200,
    user,
    staff: access.staff,
    organizationId: access.organizationId,
    organization_id: access.organizationId,
    membership: access.membership || null,
    role: access.role || access.staff?.role || null,
    permissions: access.permissions || [],
    access,
    availableOrganizationIds,
    selectionSource: explicitOrganizationId
      ? "explicit"
      : requestOrganizationId
        ? "request"
        : persistedOrganizationId
          ? "persisted"
          : staffOrganizationId
            ? "staff_active"
            : "single",
  };
}
