import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

function businessErrorStatus(message) {
  if (String(message || "").includes("HOTEL_INVENTORY_CONFLICT")) return 409;
  if (String(message || "").includes("HOTEL_STAY_EXTENSION")) return 409;
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || body.booking_id || "").trim();
    const newCheckOutDate = String(body.newCheckOutDate || body.new_check_out_date || "").trim();

    if (!bookingId) return errorResponse("bookingId required", 400);
    if (!ISO_DATE.test(newCheckOutDate)) return errorResponse("newCheckOutDate must be YYYY-MM-DD", 400);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id,property_id,room_id,status,check_out_date")
      .eq("id", bookingId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.organization_id) return errorResponse("Booking not found", 404);

    const access = await requireOrganizationAccess({
      organizationId: existing.organization_id,
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);

    if (String(existing.status || "").toUpperCase() !== "CHECKED_IN") {
      return errorResponse("Only a checked-in stay can be extended", 409);
    }
    if (newCheckOutDate <= String(existing.check_out_date || "").slice(0, 10)) {
      return errorResponse("New departure date must be after the current departure date", 409);
    }

    const { data: extension, error: extensionError } = await supabaseAdmin.rpc(
      "hotel_extend_checked_in_stay_guarded",
      {
        p_organization_id: access.organizationId,
        p_booking_id: bookingId,
        p_new_check_out_date: newCheckOutDate,
      }
    );

    if (extensionError) {
      return errorResponse(
        extensionError.message || "Stay extension failed",
        businessErrorStatus(extensionError.message)
      );
    }

    return NextResponse.json({
      success: true,
      extension,
      pricingReviewRequired: extension?.pricing_review_required !== false,
    });
  } catch (error) {
    console.error("HOTEL_BOOKING_EXTEND_ERROR", error);
    return errorResponse(error?.message || "Stay extension failed", 500);
  }
}
