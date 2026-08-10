import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("hotel_bookings")
      .select(`
        *,
        hotel_rooms (
          room_number,
          room_type
        ),
        hotel_guests (
          full_name
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      bookings: data || [],
    });
  } catch (error) {
    console.error("HOTEL_BOOKING_LIST_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Booking lookup failed" },
      { status: 500 },
    );
  }
}
