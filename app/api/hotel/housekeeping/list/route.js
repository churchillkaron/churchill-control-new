import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const organizationId = String(
      request.nextUrl.searchParams.get("organizationId") ||
        request.nextUrl.searchParams.get("organization_id") ||
        "",
    ).trim();

    if (!organizationId) {
      return errorResponse("organizationId required", 400);
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from("hotel_housekeeping_tasks")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });

    if (tasksError) throw tasksError;

    const roomIds = [
      ...new Set((tasks || []).map((task) => task.room_id).filter(Boolean)),
    ];

    let roomById = new Map();
    let arrivalByRoomId = new Map();

    if (roomIds.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: rooms, error: roomsError }, { data: arrivals, error: arrivalsError }] = await Promise.all([
        supabaseAdmin
          .from("hotel_rooms")
          .select("id,room_number,room_type,status")
          .eq("organization_id", access.organizationId)
          .in("id", roomIds),
        supabaseAdmin
          .from("hotel_bookings")
          .select("id,room_id,check_in_date,check_out_date,status")
          .eq("organization_id", access.organizationId)
          .eq("status", "RESERVED")
          .in("room_id", roomIds)
          .lte("check_in_date", today)
          .order("check_in_date", { ascending: true }),
      ]);

      if (roomsError) throw roomsError;
      if (arrivalsError) throw arrivalsError;

      roomById = new Map((rooms || []).map((room) => [room.id, room]));
      for (const arrival of arrivals || []) {
        if (arrival.room_id && !arrivalByRoomId.has(arrival.room_id)) {
          arrivalByRoomId.set(arrival.room_id, {
            booking_id: arrival.id,
            check_in_date: arrival.check_in_date,
            check_out_date: arrival.check_out_date,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      tasks: (tasks || []).map((task) => ({
        ...task,
        hotel_rooms: task.room_id ? roomById.get(task.room_id) || null : null,
        arrival_waiting: task.room_id ? arrivalByRoomId.get(task.room_id) || null : null,
      })),
    });
  } catch (error) {
    console.error("HOTEL_HOUSEKEEPING_LIST_ERROR", error);
    return errorResponse(error?.message || "Housekeeping list failed");
  }
}
