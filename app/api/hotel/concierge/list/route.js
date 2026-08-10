import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const organizationId = String(
      request.nextUrl.searchParams.get("organizationId") ||
        request.nextUrl.searchParams.get("organization_id") ||
        "",
    ).trim();

    if (!organizationId) return errorResponse("organizationId required", 400);

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);

    const { data: requests, error } = await supabaseAdmin
      .from("hotel_concierge_requests")
      .select(`
        *,
        hotel_guests (
          full_name
        ),
        hotel_properties (
          name
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      requests: requests || [],
    });
  } catch (error) {
    console.error("HOTEL_CONCIERGE_LIST_ERROR", error);
    return errorResponse(error?.message || "Concierge list failed");
  }
}
