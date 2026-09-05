import { NextResponse } from "next/server";

import { evaluateHotelArrivalReadiness } from "@/lib/hotel/server/getHotelArrivalReadiness";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const ACTIVE_TURNOVER_STATUSES = Object.freeze(["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"]);

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
          room_type,
          status
        ),
        hotel_guests (
          full_name,
          identity_verified_at
        )
      `)
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const roomIds = [...new Set((data || []).map((booking) => booking.room_id).filter(Boolean))];
    const turnoverByRoomId = new Map();

    if (roomIds.length) {
      const { data: turnoverTasks, error: turnoverError } = await supabaseAdmin
        .from("hotel_housekeeping_tasks")
        .select("id,room_id,booking_id,task_type,task_status,scheduled_at,updated_at")
        .eq("organization_id", access.organizationId)
        .in("room_id", roomIds)
        .in("task_status", ACTIVE_TURNOVER_STATUSES)
        .order("updated_at", { ascending: false });

      if (turnoverError) throw turnoverError;
      for (const task of turnoverTasks || []) {
        if (task.room_id && !turnoverByRoomId.has(task.room_id)) {
          turnoverByRoomId.set(task.room_id, task);
        }
      }
    }

    const bookings = (data || []).map((booking) => ({
      ...booking,
      room_turnover: booking.room_id ? turnoverByRoomId.get(booking.room_id) || null : null,
      arrival_readiness: evaluateHotelArrivalReadiness(booking),
    }));

    return NextResponse.json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("HOTEL_BOOKING_LIST_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Booking lookup failed" },
      { status: 500 },
    );
  }
}
