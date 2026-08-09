export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_ORGANIZATION_COOKIE = "avantiqo_active_organization_id";
const LEGACY_ACTIVE_ORGANIZATION_COOKIE = "active_organization_id";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = String(
      body?.organizationId || body?.organization_id || ""
    ).trim();

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
        },
        { status: context.status || 403 }
      );
    }

    const staffId = context.staff?.id || null;
    const authUserId = context.user?.id || null;

    if (!staffId || !authUserId) {
      return NextResponse.json(
        { success: false, error: "Staff identity could not be resolved" },
        { status: 409 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("staff_accounts")
      .update({ active_organization_id: context.organizationId })
      .eq("id", staffId)
      .eq("auth_user_id", authUserId);

    if (updateError) throw updateError;

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .eq("id", context.organizationId)
      .maybeSingle();

    if (organizationError) throw organizationError;

    const response = NextResponse.json({
      success: true,
      organization: organization || null,
      organizationId: context.organizationId,
      organization_id: context.organizationId,
      active_organization_id: context.organizationId,
      staffId,
      role: context.role || null,
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    };

    response.cookies.set(
      ACTIVE_ORGANIZATION_COOKIE,
      context.organizationId,
      cookieOptions
    );
    response.cookies.set(
      LEGACY_ACTIVE_ORGANIZATION_COOKIE,
      context.organizationId,
      cookieOptions
    );

    return response;
  } catch (error) {
    console.error("SESSION_ORGANIZATION_SELECTION_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to select organization",
      },
      { status: 500 }
    );
  }
}
