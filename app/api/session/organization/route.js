export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

const ACTIVE_ORGANIZATION_COOKIE = "avantiqo_active_organization_id";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || "").trim();

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

    const response = NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      staffId: context.staff.id,
      role: context.role || null,
    });

    response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, context.organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    console.error("SESSION_ORGANIZATION_SELECTION_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to select organization",
      },
      { status: 400 }
    );
  }
}
