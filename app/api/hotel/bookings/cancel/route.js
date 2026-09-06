import { NextResponse } from "next/server";

import { broadcastHotelReadinessChanged } from "@/lib/hotel/server/broadcastHotelReadinessChanged";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const REASONS = new Set([
  "GUEST_REQUEST",
  "INVALID_PAYMENT",
  "BOOKED_ELSEWHERE",
  "TRAVEL_DISRUPTION",
  "PROPERTY_UNAVAILABLE",
  "DUPLICATE_OR_ERROR",
  "OTHER",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function fail(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = clean(body.bookingId || body.booking_id);
    const reason = clean(body.reason).toUpperCase();
    const detail = clean(body.detail).slice(0, 1000) || null;

    if (!bookingId) return fail("bookingId required", 400);
    if (!REASONS.has(reason)) return fail("A valid cancellation reason is required", 400);
    if (reason === "OTHER" && !detail) return fail("Cancellation detail is required when reason is OTHER", 400);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id,property_id,room_id,group_id,status,check_in_date,check_out_date,total_amount,paid_amount,payment_status,channel_connection_id,external_reservation_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.organization_id) return fail("Booking not found", 404);

    const access = await requireOrganizationAccess({ organizationId: existing.organization_id, request });
    if (!access.success) return fail(access.error, access.status);

    if (String(existing.status || "").toUpperCase() !== "RESERVED") {
      return fail("Only a reservation that has not checked in can be cancelled", 409);
    }

    const now = new Date().toISOString();
    const { data: booking, error: updateError } = await supabaseAdmin
      .from("hotel_bookings")
      .update({
        status: "CANCELLED",
        cancelled_at: now,
        cancellation_reason: reason,
        cancellation_detail: detail,
        updated_at: now,
      })
      .eq("id", bookingId)
      .eq("organization_id", access.organizationId)
      .eq("status", "RESERVED")
      .select("id,organization_id,property_id,room_id,group_id,status,check_in_date,check_out_date,total_amount,paid_amount,payment_status,cancelled_at,cancellation_reason,cancellation_detail,channel_connection_id,external_reservation_id")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!booking) return fail("Reservation changed before cancellation completed", 409);

    await broadcastHotelReadinessChanged({
      organizationId: access.organizationId,
      source: "reservation-lifecycle",
      action: "CANCEL",
    });

    return NextResponse.json({
      success: true,
      booking,
      stayInventoryReleased: true,
      groupInventoryStillProtected: Boolean(booking.group_id),
      financialReviewRequired: Number(booking.paid_amount || 0) > 0,
      commercialDecision: {
        cancellationFeePosted: false,
        refundCreated: false,
        depositForfeited: false,
        folioChanged: false,
      },
      channelReportingRequired: Boolean(booking.channel_connection_id && booking.external_reservation_id),
    });
  } catch (error) {
    console.error("HOTEL_BOOKING_CANCEL_ERROR", error);
    return fail(error?.message || "Unable to cancel reservation", 500);
  }
}
