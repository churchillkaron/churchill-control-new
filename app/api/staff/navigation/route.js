export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { buildStaffPortalNavigation } from "@/lib/people/portal/StaffPortalNavigationRuntime";
import { resolveStaffPortalEffectivePermissions } from "@/lib/people/portal/StaffPortalPermissionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) {
      return NextResponse.json({
        success: false,
        error: context.error,
        code: context.code,
        availableOrganizationIds: context.availableOrganizationIds || [],
      }, { status: context.status || 403 });
    }

    const [effectiveAccess, organizationResult, organizationsResult] = await Promise.all([
      resolveStaffPortalEffectivePermissions({
      organizationId: context.organizationId,
      userId: context.user?.id || null,
      role: context.role,
      basePermissions: context.permissions || [],
      }),
      supabaseAdmin.from("organizations")
        .select("id,name,industry,organization_type")
        .eq("id", context.organizationId)
        .maybeSingle(),
      supabaseAdmin.from("organizations")
        .select("id,name,industry,organization_type")
        .in("id", context.availableOrganizationIds || [context.organizationId])
        .order("name", { ascending: true }),
    ]);
    if (organizationResult.error) throw organizationResult.error;
    if (organizationsResult.error) throw organizationsResult.error;

    const navigation = buildStaffPortalNavigation({
      organizationId: context.organizationId,
      role: context.role,
      permissions: effectiveAccess.permissions,
      membership: context.membership,
      staff: context.staff,
      organization: organizationResult.data || { id: context.organizationId },
    });

    return NextResponse.json({
      success: true,
      navigation,
      organizations: (organizationsResult.data || []).map((organization) => ({
        id: organization.id,
        name: organization.name || "Organization",
      })),
    });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to resolve staff portal navigation");
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = String(body?.organizationId || body?.organization_id || "").trim();
    if (!organizationId) {
      return NextResponse.json({ success: false, error: "organizationId required" }, { status: 400 });
    }

    const context = await resolveAuthenticatedStaffContext({ request, organizationId, allowIncompleteActivation: true });
    if (!context.success) {
      return NextResponse.json({
        success: false,
        error: context.error,
        code: context.code,
        availableOrganizationIds: context.availableOrganizationIds || [],
      }, { status: context.status || 403 });
    }

    const response = NextResponse.json({ success: true, organizationId: context.organizationId });
    response.cookies.set("avantiqo_active_organization_id", context.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to switch staff organization");
  }
}
