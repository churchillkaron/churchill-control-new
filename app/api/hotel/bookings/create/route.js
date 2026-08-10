import { NextResponse } from "next/server";

import { checkAvailability } from "@/lib/hotel/checkAvailability";
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
    const organizationId = cleanValue(
      body.organizationId || body.organization_id,
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const roomId = cleanValue(body.roomId || body.room_id);
    const guestId = cleanValue(body.guestId || body.guest_id);
    const checkInDate = cleanValue(body.check_in_date || body.checkInDate);
    const checkOutDate = cleanValue(body.check_out_date || body.checkOutDate);

    if (!roomId) return errorResponse("roomId required", 400);
    if (!checkInDate) return errorResponse("check_in_date required", 400);
    if (!checkOutDate) return errorResponse("check_out_date required", 400);
    if (checkOutDate <= checkInDate) {
      return errorResponse("check_out_date must be after check_in_date", 400);
    }

    const { data: room, error: roomError } = await supabaseAdmin
      .from("hotel_rooms")
      .select("id,organization_id,status")
      .eq("id", roomId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();

    if (roomError) throw roomError;
    if (!room) return errorResponse("Room not found", 404);

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

    const isAvailable = await checkAvailability({
      supabase: supabaseAdmin,
      roomId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      organizationId: access.organizationId,
    });

    if (!isAvailable) {
      return errorResponse("Room is not available for the selected dates", 409);
    }

    const { data, error } = await supabaseAdmin
      .from("hotel_bookings")
      .insert({
        organization_id: access.organizationId,
        room_id: roomId,
        guest_id: guestId,
        booking_reference: cleanValue(body.bookingReference || body.booking_reference),
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        adults: Number(body.adults ?? 1),
        children: Number(body.children ?? 0),
        status: "RESERVED",
        source: cleanValue(body.source) || "DIRECT",
        total_amount: Number(body.totalAmount ?? body.total_amount ?? 0),
        paid_amount: Number(body.paidAmount ?? body.paid_amount ?? 0),
        payment_status: cleanValue(body.paymentStatus || body.payment_status) || "UNPAID",
        notes: cleanValue(body.notes),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, booking: data });
  } catch (error) {
    console.error("HOTEL_BOOKING_CREATE_ERROR", error);
    return errorResponse(error?.message || "Booking creation failed");
  }
}
