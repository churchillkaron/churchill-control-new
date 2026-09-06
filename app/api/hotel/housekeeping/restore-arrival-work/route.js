import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

function governedRecoveryMessage(error) {
  const message = clean(error?.message || error?.details || error?.hint);
  const known = [
    "Arrival booking not found",
    "Housekeeping recovery is only available for a reserved arrival",
    "Arrival must have an assigned property room before Housekeeping recovery",
    "Property operational day must be configured before Housekeeping recovery",
    "Property operational day timezone is invalid",
    "Arrival is not due on the property business day",
    "Assigned room was not found for this arrival",
    "Assigned room state does not require Housekeeping recovery",
    "Maintenance now owns this room-readiness blocker",
  ];
  return known.find((entry) => message.includes(entry)) || null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = clean(body.bookingId || body.booking_id);
    if (!bookingId) return fail("bookingId required", 400);

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id,status,room_id,property_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking?.organization_id) return fail("Arrival booking not found", 404);

    const access = await requireOrganizationAccess({ organizationId: booking.organization_id, request });
    if (!access.success) return fail(access.error, access.status);

    const { data, error } = await supabaseAdmin.rpc("hotel_restore_housekeeping_work_for_arrival", {
      p_organization_id: access.organizationId,
      p_booking_id: bookingId,
    });
    if (error) {
      const governed = governedRecoveryMessage(error);
      if (governed) return fail(governed, governed === "Arrival booking not found" ? 404 : 409);
      throw error;
    }

    const task = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      task: task || null,
      authority: {
        bookingReauthorizedServerSide: true,
        operationalDayRecheckedAtomically: true,
        roomStateRecheckedAtomically: true,
        maintenanceOwnershipRecheckedAtomically: true,
        duplicateActiveWorkPrevented: true,
      },
    });
  } catch (error) {
    console.error("HOTEL_HOUSEKEEPING_RESTORE_ARRIVAL_WORK_ERROR", error);
    return fail(error?.message || "Unable to restore Housekeeping work", 500);
  }
}
