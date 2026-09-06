import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = String(body.bookingId || body.booking_id || "").trim();
    const businessDate = todayIso();

    if (!bookingId) return errorResponse("bookingId required", 400);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id,property_id,room_id,group_id,status,check_in_date,check_out_date,total_amount,paid_amount,payment_status,channel_connection_id,external_reservation_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.organization_id) return errorResponse("Booking not found", 404);

    const access = await requireOrganizationAccess({
      organizationId: existing.organization_id,
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);
    if (String(existing.status || "").toUpperCase() !== "RESERVED") {
      return errorResponse("Only a reserved arrival can be recorded as a no-show", 409);
    }

    const arrivalDate = String(existing.check_in_date || "").slice(0, 10);
    if (!arrivalDate || arrivalDate >= businessDate) {
      return errorResponse("No-show can be recorded only after the reserved arrival date has passed", 409);
    }

    const now = new Date().toISOString();
    const { data: booking, error: updateError } = await supabaseAdmin
      .from("hotel_bookings")
      .update({ status: "NO_SHOW", updated_at: now })
      .eq("id", bookingId)
      .eq("organization_id", access.organizationId)
      .eq("status", "RESERVED")
      .lt("check_in_date", businessDate)
      .select("id,organization_id,property_id,room_id,group_id,status,check_in_date,check_out_date,total_amount,paid_amount,payment_status,channel_connection_id,external_reservation_id")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!booking) return errorResponse("Reservation changed before no-show could be recorded", 409);

    return NextResponse.json({
      success: true,
      booking,
      stayInventoryReleased: true,
      groupInventoryStillProtected: Boolean(booking.group_id),
      financialReviewRequired: true,
      commercialDecision: {
        pricingChanged: false,
        paymentsChanged: false,
        folioChanged: false,
      },
      channelReportingRequired: Boolean(booking.channel_connection_id && booking.external_reservation_id),
    });
  } catch (error) {
    console.error("HOTEL_BOOKING_NO_SHOW_ERROR", error);
    return errorResponse(error?.message || "Unable to record no-show", 500);
  }
}
