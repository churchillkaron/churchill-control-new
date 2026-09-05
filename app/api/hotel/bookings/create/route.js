import { NextResponse } from "next/server";

import { MarketingAttributionCaptureRuntime } from "@/lib/marketing/intelligence/MarketingAttributionCaptureRuntime";
import { MarketingBusinessOutcomeProjectionRuntime } from "@/lib/marketing/intelligence/MarketingBusinessOutcomeProjectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

function isInventoryConflict(error) {
  return String(error?.message || error || "").includes("HOTEL_INVENTORY_CONFLICT");
}

function inventoryMessage(error) {
  return String(error?.message || "Hotel inventory changed before the reservation completed")
    .replace(/^.*HOTEL_INVENTORY_CONFLICT:\s*/i, "")
    .trim();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = cleanValue(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const roomId = cleanValue(body.roomId || body.room_id);
    const guestId = cleanValue(body.guestId || body.guest_id);
    const groupId = cleanValue(body.groupId || body.group_id);
    const ratePlanId = cleanValue(body.ratePlanId || body.rate_plan_id);
    const checkInDate = cleanValue(body.check_in_date || body.checkInDate);
    const checkOutDate = cleanValue(body.check_out_date || body.checkOutDate);

    if (!roomId) return errorResponse("roomId required", 400);
    if (!checkInDate) return errorResponse("check_in_date required", 400);
    if (!checkOutDate) return errorResponse("check_out_date required", 400);
    if (checkOutDate <= checkInDate) return errorResponse("check_out_date must be after check_in_date", 400);

    const { data: booking, error } = await supabaseAdmin.rpc("hotel_create_booking_guarded", {
      p_organization_id: access.organizationId,
      p_room_id: roomId,
      p_guest_id: guestId,
      p_group_id: groupId,
      p_rate_plan_id: ratePlanId,
      p_booking_reference: cleanValue(body.bookingReference || body.booking_reference),
      p_check_in_date: checkInDate,
      p_check_out_date: checkOutDate,
      p_adults: Number(body.adults ?? 1),
      p_children: Number(body.children ?? 0),
      p_source: cleanValue(body.source) || (groupId ? "GROUP" : "DIRECT"),
      p_total_amount: Number(body.totalAmount ?? body.total_amount ?? 0),
      p_paid_amount: Number(body.paidAmount ?? body.paid_amount ?? 0),
      p_payment_status: cleanValue(body.paymentStatus || body.payment_status) || "UNPAID",
      p_currency_code: cleanValue(body.currency || body.currency_code) || "THB",
      p_notes: cleanValue(body.notes),
    });

    if (error) {
      if (isInventoryConflict(error)) return errorResponse(inventoryMessage(error), 409);
      throw error;
    }
    if (!booking?.id) throw new Error("Guarded reservation did not return a booking");

    const tracking = MarketingAttributionCaptureRuntime.fromObject(body);
    let marketingOutcome = null;
    if (tracking) {
      marketingOutcome = await MarketingBusinessOutcomeProjectionRuntime.project({
        organizationId: access.organizationId,
        outcomeType: "BOOKING",
        quantity: 1,
        revenue: Number(booking.total_amount || 0),
        currency: booking.currency_code || "THB",
        reservationId: booking.id,
        sourceDocumentType: "hotel_booking",
        sourceDocumentId: booking.id,
        eventId: `hotel-booking-created:${booking.id}`,
        tracking,
        metadata: {
          booking_reference: booking.booking_reference || null,
          booking_source: booking.source || null,
          payment_status: booking.payment_status || null,
          property_id: booking.property_id || null,
          group_id: booking.group_id || null,
          rate_plan_id: booking.rate_plan_id || null,
        },
      }).catch((projectionError) => ({
        projected: false,
        reason: projectionError?.message || "MARKETING_OUTCOME_PROJECTION_FAILED",
      }));
    }

    return NextResponse.json({ success: true, booking, marketing_outcome: marketingOutcome });
  } catch (error) {
    console.error("HOTEL_BOOKING_CREATE_ERROR", error);
    if (isInventoryConflict(error)) return errorResponse(inventoryMessage(error), 409);
    return errorResponse(error?.message || "Booking creation failed");
  }
}
