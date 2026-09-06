import { NextResponse } from "next/server";

import { getHotelRoomAssignmentOptions } from "@/lib/hotel/server/getHotelRoomAssignmentOptions";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

function governedAssignmentMessage(error) {
  const message = clean(error?.message || error?.details || error?.hint);
  const known = [
    "Only reserved or in-house stays can receive a room assignment",
    "Booking property required before room assignment",
    "Booking stay dates are invalid for room assignment",
    "Target room not found",
    "Target room belongs to another property",
    "Target room capacity is insufficient for this stay",
    "Target room is out of service",
    "Target room has unresolved maintenance work",
    "Target room is already committed to an overlapping stay",
    "Target room is not physically ready for an arrival due now",
    "Target room still has active Housekeeping work",
    "Target room readiness changed during assignment",
  ];
  return known.find((entry) => message.includes(entry)) || null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = clean(body.bookingId || body.booking_id);
    const roomId = clean(body.roomId || body.room_id);
    if (!bookingId) return fail("bookingId required");
    if (!roomId) return fail("roomId required");

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id,status,room_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return fail("Booking not found", 404);

    const access = await requireOrganizationAccess({ organizationId: booking.organization_id, request });
    if (!access.success) return fail(access.error, access.status);

    const prepared = await getHotelRoomAssignmentOptions({ organizationId: access.organizationId, bookingId });
    const option = prepared.options.find((room) => room.id === roomId);
    if (!option) return fail("Room is outside this property's governed room set", 409);
    if (!option.assignableNow) {
      return fail(option.blockedReasons?.[0]?.detail || "Room is not safe to assign to this stay", 409);
    }

    const requireReady = prepared.arrivalDueNow || String(booking.status || "").toUpperCase() === "CHECKED_IN";
    const reason = clean(body.reason) || (booking.room_id ? "Front Desk governed room move" : "Front Desk governed room assignment");
    const { data: assigned, error: assignmentError } = await supabaseAdmin.rpc("hotel_assign_booking_room_guarded", {
      p_organization_id: access.organizationId,
      p_booking_id: bookingId,
      p_room_id: roomId,
      p_require_ready: requireReady,
      p_reason: reason,
    });
    if (assignmentError) {
      const governed = governedAssignmentMessage(assignmentError);
      if (governed) return fail(governed, 409);
      throw assignmentError;
    }

    const row = Array.isArray(assigned) ? assigned[0] : assigned;
    const { data: room, error: roomError } = await supabaseAdmin
      .from("hotel_rooms")
      .select("id,room_number,room_type,max_guests,status")
      .eq("organization_id", access.organizationId)
      .eq("id", roomId)
      .maybeSingle();
    if (roomError) throw roomError;

    return NextResponse.json({
      success: true,
      booking: row || null,
      room: room || null,
      authority: {
        recommendationRecheckedBeforeWrite: true,
        assignmentRecheckedAtomically: true,
        requireReady,
      },
    });
  } catch (error) {
    console.error("HOTEL_ASSIGN_ROOM_ERROR", error);
    return fail(error?.message || "Unable to assign Hotel room", 500);
  }
}
