import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  HotelBookingTransitionError,
  transitionHotelBooking,
} from "@/lib/hotel/server/transitionHotelBooking";

export const dynamic = "force-dynamic";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || body.booking_id || "").trim();

    if (!bookingId) return errorResponse("bookingId required", 400);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id,room_id,status")
      .eq("id", bookingId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.organization_id) return errorResponse("Booking not found", 404);

    const access = await requireOrganizationAccess({
      organizationId: existing.organization_id,
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);

    if (existing.status === "CHECKED_OUT") {
      return NextResponse.json({
        success: true,
        alreadyCheckedOut: true,
        booking: existing,
      });
    }

    const booking = await transitionHotelBooking({
      supabase: supabaseAdmin,
      organizationId: access.organizationId,
      bookingId,
      action: "CHECK_OUT",
    });

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error("HOTEL_BOOKING_CHECK_OUT_ERROR", error);
    return errorResponse(
      error?.message || "Check-out failed",
      error instanceof HotelBookingTransitionError ? error.status : 500
    );
  }
}
