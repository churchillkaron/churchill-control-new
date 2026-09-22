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
        hotel_properties (
          name
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = requests || [];
    const guestIds = [...new Set(rows.map((row) => row.guest_id).filter(Boolean))];
    let guestById = new Map();

    if (guestIds.length) {
      const { data: guests, error: guestsError } = await supabaseAdmin
        .from("hotel_guests")
        .select("id,full_name")
        .eq("organization_id", access.organizationId)
        .in("id", guestIds);

      if (guestsError) throw guestsError;
      guestById = new Map((guests || []).map((guest) => [guest.id, guest]));
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      requests: rows.map((row) => ({
        ...row,
        hotel_guests: row.guest_id ? guestById.get(row.guest_id) || null : null,
      })),
    });
  } catch (error) {
    console.error("HOTEL_CONCIERGE_LIST_ERROR", error);
    return errorResponse(error?.message || "Concierge list failed");
  }
}
