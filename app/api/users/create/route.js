export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import provisionStaffAccess from "@/lib/people/employees/provisionStaffAccess";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
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

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
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

async function managementContext(request) {
  const user = await getServerCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const { data: actingStaff, error: actingStaffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,role,active_organization_id,active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (actingStaffError) throw actingStaffError;

  if (!actingStaff?.active_organization_id) {
    return {
      response: NextResponse.json(
        { success: false, error: "Active organization not found" },
        { status: 403 }
      ),
    };
  }

  const access = await requireOrganizationAccess({
    organizationId: actingStaff.active_organization_id,
    request,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      ),
    };
  }

  const actingRole = normalizeRole(access.role || actingStaff.role);

  if (!STAFF_MANAGEMENT_ROLES.has(actingRole)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Staff management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    actingStaff,
    actingRole,
    organizationId: actingStaff.active_organization_id,
    access,
  };
}

export async function GET(request) {
  try {
    const context = await managementContext(request);
    if (context.response) return context.response;

    const { data: staff, error } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
      .eq("active_organization_id", context.organizationId)
      .order("name", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      actingRole: context.actingRole,
      staff: staff || [],
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

    if (OWNER_LEVEL_ROLES.has(role) && !OWNER_LEVEL_ROLES.has(context.actingRole)) {
      return NextResponse.json(
        { success: false, error: "Only an owner can provision owner-level access" },
        { status: 403 }
      );
    }

    const redirectTo = new URL(
      "/login#type=recovery",
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

    const { data: target, error: targetError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,role,active_organization_id")
      .eq("id", staffId)
      .eq("active_organization_id", context.organizationId)
      .maybeSingle();

    if (targetError) throw targetError;
    if (!target) {
      return NextResponse.json(
        { success: false, error: "Staff account not found" },
        { status: 404 }
      );
    }

    if (OWNER_LEVEL_ROLES.has(normalizeRole(target.role)) && !OWNER_LEVEL_ROLES.has(context.actingRole)) {
      return NextResponse.json(
        { success: false, error: "Only an owner can manage owner-level access" },
        { status: 403 }
      );
    }

    const { data: staff, error: updateError } = await supabaseAdmin
      .from("staff_accounts")
      .update({ active: body.active })
      .eq("id", staffId)
      .eq("active_organization_id", context.organizationId)
      .select("id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id")
      .single();

    if (updateError) throw updateError;

    const { error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .update({ status: body.active ? "active" : "inactive" })
      .eq("organization_id", context.organizationId)
      .eq("staff_account_id", staffId);

    if (membershipError) throw membershipError;

    return NextResponse.json({ success: true, staff });
  } catch (error) {
    console.error("UPDATE_STAFF_ACCESS_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update staff" },
      { status: 400 }
    );
  }
}
