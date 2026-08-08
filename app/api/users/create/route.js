export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import provisionStaffAccess from "@/lib/people/employees/provisionStaffAccess";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STAFF_CREATION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "MANAGER",
]);

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

export async function POST(request) {
  try {
    const user = await getServerCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: actingStaff, error: actingStaffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,role,active_organization_id,active")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (actingStaffError) throw actingStaffError;

    if (!actingStaff?.active_organization_id) {
      return NextResponse.json(
        { success: false, error: "Active organization not found" },
        { status: 403 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: actingStaff.active_organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const actingRole = String(access.role || actingStaff.role || "")
      .trim()
      .toUpperCase();

    if (!STAFF_CREATION_ROLES.has(actingRole)) {
      return NextResponse.json(
        { success: false, error: "Staff management permission required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "").trim().toUpperCase();
    const position = String(body?.position || "").trim() || null;

    if (!name || !email || !role) {
      return NextResponse.json(
        { success: false, error: "Name, email and role are required" },
        { status: 400 }
      );
    }

    if (
      ["OWNER", "SUPER_ADMIN", "PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORG_OWNER"].includes(role) &&
      !["OWNER", "SUPER_ADMIN", "PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORG_OWNER"].includes(actingRole)
    ) {
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
      organizationId: actingStaff.active_organization_id,
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
