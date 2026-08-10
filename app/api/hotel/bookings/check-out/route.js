import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("hotel_bookings")
      .update({
        status: "CHECKED_OUT",
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("organization_id", access.organizationId)
      .select()
      .single();

    if (bookingError) throw bookingError;

    if (existing.room_id) {
      const { error: roomError } = await supabaseAdmin
        .from("hotel_rooms")
        .update({
          status: "DIRTY",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.room_id)
        .eq("organization_id", access.organizationId);

      if (roomError) throw roomError;

      const { error: taskError } = await supabaseAdmin
        .from("hotel_housekeeping_tasks")
        .insert({
          organization_id: access.organizationId,
          room_id: existing.room_id,
          task_status: "PENDING",
          priority: "NORMAL",
          task_date: new Date().toISOString().slice(0, 10),
          notes: "Post-checkout cleaning",
        });

      if (taskError) throw taskError;
    }

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error("HOTEL_BOOKING_CHECK_OUT_ERROR", error);
    return errorResponse(error?.message || "Check-out failed");
  }
}
