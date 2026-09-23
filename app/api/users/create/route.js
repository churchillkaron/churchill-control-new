export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import provisionStaffAccess from "@/lib/people/employees/provisionStaffAccess";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STAFF_MANAGEMENT_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "MANAGER",
]);

const OWNER_LEVEL_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

const NEUTRAL_BASE_ROLES = ["STAFF", "MANAGER", "OWNER"];
const ROLE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()) && String(value || "").trim().length <= 320;

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function validRole(value) {
  return ROLE_PATTERN.test(normalizeRole(value));
}

function resolveRedirectOrigin(request) {
  const configuredOrigin = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall back to the request origin.
    }
  }

  return new URL(request.url).origin;
}

function contextResponse(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function managementContext(request) {
  const context = await resolveAuthenticatedStaffContext({ request });

  if (!context.success) {
    return { response: contextResponse(context) };
  }

  const actingRole = normalizeRole(context.role || context.staff?.role);

  if (!STAFF_MANAGEMENT_ROLES.has(actingRole)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Staff management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    user: context.user,
    actingStaff: context.staff,
    actingRole,
    organizationId: context.organizationId,
    access: context.access,
  };
}

async function organizationRoleCatalog(organizationId, staff = []) {
  const [{ data: memberships, error: membershipError }, { data: permissionRows, error: permissionError }] = await Promise.all([
    supabaseAdmin
      .from("organization_users")
      .select("role")
      .eq("organization_id", organizationId)
      .limit(5000),
    supabaseAdmin
      .from("role_permissions")
      .select("role")
      .eq("organization_id", organizationId)
      .limit(5000),
  ]);

  if (membershipError) throw membershipError;
  if (permissionError) throw permissionError;

  const roles = new Set(NEUTRAL_BASE_ROLES);
  for (const row of staff || []) {
    const role = normalizeRole(row?.role);
    if (validRole(role)) roles.add(role);
  }
  for (const row of memberships || []) {
    const role = normalizeRole(row?.role);
    if (validRole(role)) roles.add(role);
  }
  for (const row of permissionRows || []) {
    const role = normalizeRole(row?.role);
    if (validRole(role)) roles.add(role);
  }

  return [...roles].sort((left, right) => {
    if (left === "STAFF") return -1;
    if (right === "STAFF") return 1;
    if (left === "MANAGER") return -1;
    if (right === "MANAGER") return 1;
    if (left === "OWNER") return 1;
    if (right === "OWNER") return -1;
    return left.localeCompare(right);
  });
}

export async function GET(request) {
  try {
    const context = await managementContext(request);
    if (context.response) return context.response;

    const [legacyStaffResult, membershipsResult] = await Promise.all([
      supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
        .eq("active_organization_id", context.organizationId)
        .eq("active", true),
      supabaseAdmin
        .from("organization_users")
        .select("staff_account_id,role,status")
        .eq("organization_id", context.organizationId)
        .eq("status", "active"),
    ]);

    if (legacyStaffResult.error) throw legacyStaffResult.error;
    if (membershipsResult.error) throw membershipsResult.error;

    const membershipByStaffId = new Map(
      (membershipsResult.data || []).map((row) => [String(row.staff_account_id), row])
    );
    const membershipStaffIds = [...membershipByStaffId.keys()].filter(Boolean);
    let membershipStaff = [];

    if (membershipStaffIds.length) {
      const memberStaffResult = await supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
        .in("id", membershipStaffIds)
        .eq("active", true);
      if (memberStaffResult.error) throw memberStaffResult.error;
      membershipStaff = memberStaffResult.data || [];
    }

    const staffById = new Map();
    for (const row of [...(legacyStaffResult.data || []), ...membershipStaff]) {
      const membership = membershipByStaffId.get(String(row.id));
      staffById.set(String(row.id), {
        ...row,
        role: membership?.role || row.role,
        organization_role: membership?.role || row.role || null,
      });
    }
    const staff = [...staffById.values()].sort((left, right) =>
      String(left.name || left.email || "").localeCompare(String(right.name || right.email || ""))
    );

    const roleOptions = await organizationRoleCatalog(context.organizationId, staff);

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      actingRole: context.actingRole,
      roleOptions,
      staff,
    });
  } catch (error) {
    console.error("LIST_STAFF_ACCESS_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load staff" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const context = await managementContext(request);
    if (context.response) return context.response;

    const body = await request.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = normalizeRole(body?.role);
    const position = String(body?.position || "").trim() || null;

    if (!name || !email || !role) {
      return NextResponse.json(
        { success: false, error: "Name, email and role are required" },
        { status: 400 }
      );
    }

    if (!validEmail(email)) {
      return NextResponse.json(
        { success: false, error: "Staff email is invalid" },
        { status: 400 }
      );
    }

    if (!validRole(role)) {
      return NextResponse.json(
        { success: false, error: "Role must be a valid organization role identifier" },
        { status: 400 }
      );
    }

    if (OWNER_LEVEL_ROLES.has(role) && !OWNER_LEVEL_ROLES.has(context.actingRole)) {
      return NextResponse.json(
        { success: false, error: "Only an owner can provision owner-level access" },
        { status: 403 }
      );
    }

    const redirectTo = new URL(
      "/login?portal=staff#type=recovery",
      resolveRedirectOrigin(request)
    ).toString();

    const result = await provisionStaffAccess({
      organizationId: context.organizationId,
      name,
      email,
      role,
      position,
      redirectTo,
    });

    return NextResponse.json({
      success: true,
      staff: result.staff,
      party: result.party,
      inviteSent: result.inviteSent,
      alreadyLinked: result.alreadyLinked,
      message: result.alreadyLinked
        ? "Staff access is already linked."
        : result.inviteSent
          ? "Staff created and invitation sent."
          : "Staff access linked to the existing authentication account.",
    });
  } catch (error) {
    console.error("CREATE_STAFF_ACCESS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to create staff access",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request) {
  try {
    const context = await managementContext(request);
    if (context.response) return context.response;

    const body = await request.json();
    const staffId = String(body?.staffId || "").trim();

    if (!staffId || typeof body?.active !== "boolean") {
      return NextResponse.json(
        { success: false, error: "staffId and active are required" },
        { status: 400 }
      );
    }

    if (staffId === context.actingStaff.id && body.active === false) {
      return NextResponse.json(
        { success: false, error: "You cannot deactivate your own account" },
        { status: 400 }
      );
    }

    const [{ data: target, error: targetError }, { data: membership, error: membershipLookupError }] =
      await Promise.all([
        supabaseAdmin
          .from("staff_accounts")
          .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
          .eq("id", staffId)
          .maybeSingle(),
        supabaseAdmin
          .from("organization_users")
          .select("id,role,status")
          .eq("organization_id", context.organizationId)
          .eq("staff_account_id", staffId)
          .maybeSingle(),
      ]);

    if (targetError) throw targetError;
    if (membershipLookupError) throw membershipLookupError;
    const legacyScoped =
      target && String(target.active_organization_id || "") === String(context.organizationId);
    if (!target || (!membership && !legacyScoped)) {
      return NextResponse.json(
        { success: false, error: "Staff account not found" },
        { status: 404 }
      );
    }

    const targetRole = normalizeRole(membership?.role || target.role);
    if (OWNER_LEVEL_ROLES.has(targetRole) && !OWNER_LEVEL_ROLES.has(context.actingRole)) {
      return NextResponse.json(
        { success: false, error: "Only an owner can manage owner-level access" },
        { status: 403 }
      );
    }

    if (membership) {
      const { error: membershipError } = await supabaseAdmin
        .from("organization_users")
        .update({ status: body.active ? "active" : "inactive" })
        .eq("id", membership.id)
        .eq("organization_id", context.organizationId)
        .eq("staff_account_id", staffId);
      if (membershipError) throw membershipError;
    }

    const activeMemberships = await supabaseAdmin
      .from("organization_users")
      .select("organization_id")
      .eq("staff_account_id", staffId)
      .eq("status", "active")
      .limit(1000);
    if (activeMemberships.error) throw activeMemberships.error;

    const hasActiveMembership = (activeMemberships.data || []).length > 0;
    const nextGlobalActive = membership
      ? hasActiveMembership
      : body.active;

    const staffUpdate = {};
    if (target.active !== nextGlobalActive) staffUpdate.active = nextGlobalActive;
    if (!nextGlobalActive) {
      staffUpdate.active_organization_id = null;
      staffUpdate.party_id = null;
    } else if (
      body.active === false &&
      String(target.active_organization_id || "") === String(context.organizationId)
    ) {
      const fallbackOrganizationId = activeMemberships.data?.[0]?.organization_id || null;
      if (fallbackOrganizationId) {
        staffUpdate.active_organization_id = fallbackOrganizationId;
        staffUpdate.party_id = null;
      }
    }

    let staff = target;
    if (Object.keys(staffUpdate).length) {
      const updated = await supabaseAdmin
        .from("staff_accounts")
        .update(staffUpdate)
        .eq("id", staffId)
        .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
        .single();
      if (updated.error) throw updated.error;
      staff = updated.data;
    }

    return NextResponse.json({
      success: true,
      staff: {
        ...staff,
        role: membership?.role || staff.role,
        organization_role: membership?.role || staff.role || null,
        membership_status: body.active ? "active" : "inactive",
      },
    });
  } catch (error) {
    console.error("UPDATE_STAFF_ACCESS_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update staff" },
      { status: 400 }
    );
  }
}
