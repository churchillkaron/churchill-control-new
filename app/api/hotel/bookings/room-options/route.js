import { NextResponse } from "next/server";

import { getHotelRoomAssignmentOptions } from "@/lib/hotel/server/getHotelRoomAssignmentOptions";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(request) {
  try {
    const bookingId = clean(request.nextUrl.searchParams.get("bookingId") || request.nextUrl.searchParams.get("booking_id"));
    if (!bookingId) return fail("bookingId required");

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return fail("Booking not found", 404);

    const access = await requireOrganizationAccess({ organizationId: booking.organization_id, request });
    if (!access.success) return fail(access.error, access.status);

    const result = await getHotelRoomAssignmentOptions({ organizationId: access.organizationId, bookingId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("HOTEL_ROOM_OPTIONS_ERROR", error);
    return fail(error?.message || "Unable to evaluate Hotel room options", 500);
  }
}
