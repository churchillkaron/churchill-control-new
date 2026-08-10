import { NextResponse } from "next/server";

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
    const checkInDate = cleanValue(body.checkInDate || body.check_in_date);
    const checkOutDate = cleanValue(body.checkOutDate || body.check_out_date);

    if (!organizationId) return errorResponse("organizationId required", 400);
    if (!checkInDate || !checkOutDate) {
      return errorResponse("checkInDate and checkOutDate required", 400);
    }
    if (checkOutDate <= checkInDate) {
      return errorResponse("checkOutDate must be after checkInDate", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);

    const [{ data: rooms, error: roomsError }, { data: bookings, error: bookingsError }] =
      await Promise.all([
        supabaseAdmin
          .from("hotel_rooms")
          .select("*")
          .eq("organization_id", access.organizationId)
          .neq("status", "OUT_OF_SERVICE")
          .order("room_number", { ascending: true }),
        supabaseAdmin
          .from("hotel_bookings")
          .select("room_id")
          .eq("organization_id", access.organizationId)
          .in("status", ["RESERVED", "CHECKED_IN"])
          .lt("check_in_date", checkOutDate)
          .gt("check_out_date", checkInDate),
      ]);

    if (roomsError) throw roomsError;
    if (bookingsError) throw bookingsError;

    const unavailableRoomIds = new Set(
      (bookings || []).map((booking) => booking.room_id).filter(Boolean),
    );

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      checkInDate,
      checkOutDate,
      rooms: (rooms || []).filter((room) => !unavailableRoomIds.has(room.id)),
    });
  } catch (error) {
    console.error("HOTEL_AVAILABILITY_ERROR", error);
    return errorResponse(error?.message || "Availability lookup failed");
  }
}
