import { NextResponse } from "next/server";

import { checkAvailability } from "@/lib/hotel/checkAvailability";
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

    const { data: room, error: roomError } = await supabaseAdmin
      .from("hotel_rooms")
      .select("id,organization_id,property_id,status,room_type")
      .eq("id", roomId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) return errorResponse("Room not found", 404);
    if (!room.property_id) return errorResponse("Room must be bound to a hotel property before it can be reserved", 409);

    if (guestId) {
      const { data: guest, error: guestError } = await supabaseAdmin
        .from("hotel_guests")
        .select("id")
        .eq("id", guestId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (guestError) throw guestError;
      if (!guest) return errorResponse("Guest not found", 404);
    }

    if (groupId) {
      const { data: group, error: groupError } = await supabaseAdmin
        .from("hotel_groups")
        .select("id,property_id,status")
        .eq("id", groupId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (groupError) throw groupError;
      if (!group) return errorResponse("Group not found", 404);
      if (group.property_id !== room.property_id) return errorResponse("Group and room belong to different properties", 409);
      if (["CANCELLED", "LOST", "CLOSED"].includes(String(group.status || "").toUpperCase())) return errorResponse("Group is not open for reservation pickup", 409);
    }

    if (ratePlanId) {
      const { data: ratePlan, error: ratePlanError } = await supabaseAdmin
        .from("hotel_rate_plans")
        .select("id,property_id,active")
        .eq("id", ratePlanId)
        .eq("organization_id", access.organizationId)
        .maybeSingle();
      if (ratePlanError) throw ratePlanError;
      if (!ratePlan || !ratePlan.active) return errorResponse("Active rate plan not found", 404);
      if (ratePlan.property_id !== room.property_id) return errorResponse("Rate plan and room belong to different properties", 409);
    }

    const isAvailable = await checkAvailability({
      supabase: supabaseAdmin,
      roomId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      organizationId: access.organizationId,
    });
    if (!isAvailable) return errorResponse("Room is not available for the selected dates", 409);

    const { data, error } = await supabaseAdmin
      .from("hotel_bookings")
      .insert({
        organization_id: access.organizationId,
        property_id: room.property_id,
        room_id: roomId,
        guest_id: guestId,
        group_id: groupId,
        rate_plan_id: ratePlanId,
        booking_reference: cleanValue(body.bookingReference || body.booking_reference),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        adults: Number(body.adults ?? 1),
        children: Number(body.children ?? 0),
        status: "RESERVED",
        source: cleanValue(body.source) || (groupId ? "GROUP" : "DIRECT"),
        total_amount: Number(body.totalAmount ?? body.total_amount ?? 0),
        paid_amount: Number(body.paidAmount ?? body.paid_amount ?? 0),
        payment_status: cleanValue(body.paymentStatus || body.payment_status) || "UNPAID",
        currency_code: cleanValue(body.currency || body.currency_code) || "THB",
        notes: cleanValue(body.notes),
      })
      .select()
      .single();
    if (error) throw error;

    const tracking = MarketingAttributionCaptureRuntime.fromObject(body);
    let marketingOutcome = null;
    if (tracking) {
      marketingOutcome = await MarketingBusinessOutcomeProjectionRuntime.project({
        organizationId: access.organizationId,
        outcomeType: "BOOKING",
        quantity: 1,
        revenue: Number(data.total_amount || 0),
        currency: data.currency_code || "THB",
        reservationId: data.id,
        sourceDocumentType: "hotel_booking",
        sourceDocumentId: data.id,
        eventId: `hotel-booking-created:${data.id}`,
        tracking,
        metadata: {
          booking_reference: data.booking_reference || null,
          booking_source: data.source || null,
          payment_status: data.payment_status || null,
          property_id: data.property_id || null,
          group_id: data.group_id || null,
          rate_plan_id: data.rate_plan_id || null,
        },
      }).catch((projectionError) => ({
        projected: false,
        reason: projectionError?.message || "MARKETING_OUTCOME_PROJECTION_FAILED",
      }));
    }

    return NextResponse.json({ success: true, booking: data, marketing_outcome: marketingOutcome });
  } catch (error) {
    console.error("HOTEL_BOOKING_CREATE_ERROR", error);
    return errorResponse(error?.message || "Booking creation failed");
  }
}
