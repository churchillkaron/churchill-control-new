import { NextResponse } from "next/server";

import { getHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();
const fail = (error, status = 400, details = undefined) => NextResponse.json(
  { success: false, error, ...(details ? { details } : {}) },
  { status },
);

function operationalDatePayload(value) {
  return {
    businessDate: value.businessDate,
    propertyDate: value.propertyDate,
    timezone: value.timezone,
    cutoffMinutes: value.cutoffMinutes,
    configured: value.configured,
    compatibilityFallback: value.compatibilityFallback,
  };
}

async function loadRecoveryContext(bookingId, request) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("hotel_bookings")
    .select(`
      *,
      hotel_rooms (id,room_number,room_type,status),
      hotel_guests (id,full_name)
    `)
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking?.organization_id) return { response: fail("Booking not found", 404) };

  const access = await requireOrganizationAccess({ organizationId: booking.organization_id, request });
  if (!access.success) return { response: fail(access.error, access.status) };
  if (!booking.property_id) return { response: fail("Booking has no governed Hotel property", 409) };

  const operationalDate = await getHotelOperationalDate({
    organizationId: access.organizationId,
    propertyId: booking.property_id,
  });
  if (!operationalDate.configured || operationalDate.compatibilityFallback) {
    return { response: fail("Configure the property's operational day before correcting a checkout", 409) };
  }
  if (upper(booking.status) !== "CHECKED_OUT") {
    return { response: fail("Only a checked-out stay can be reinstated", 409) };
  }
  if (!booking.actual_check_out_business_date) {
    return { response: fail("This checkout has no durable business-day evidence and cannot be automatically reinstated", 409) };
  }
  if (String(booking.actual_check_out_business_date).slice(0, 10) !== operationalDate.businessDate) {
    return { response: fail("Automatic reinstatement is available only on the same property business day as checkout", 409) };
  }

  const [auditResult, turnoverResult, roomsResult, folioResult] = await Promise.all([
    supabaseAdmin
      .from("hotel_night_audits")
      .select("id,status,business_date,closed_at")
      .eq("organization_id", access.organizationId)
      .eq("property_id", booking.property_id)
      .eq("business_date", operationalDate.businessDate)
      .maybeSingle(),
    booking.room_id
      ? supabaseAdmin
          .from("hotel_housekeeping_tasks")
          .select("id,room_id,booking_id,task_type,task_status,scheduled_at,updated_at")
          .eq("organization_id", access.organizationId)
          .eq("booking_id", booking.id)
          .eq("room_id", booking.room_id)
          .eq("task_type", "CLEANING")
          .in("task_status", ["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from("hotel_rooms")
      .select("id,room_number,room_type,status")
      .eq("organization_id", access.organizationId)
      .eq("property_id", booking.property_id)
      .eq("status", "AVAILABLE")
      .order("room_number", { ascending: true }),
    supabaseAdmin
      .from("hotel_folios")
      .select("id,status,closed_at,currency_code")
      .eq("organization_id", access.organizationId)
      .eq("booking_id", booking.id)
      .maybeSingle(),
  ]);
  if (auditResult.error) throw auditResult.error;
  if (turnoverResult.error) throw turnoverResult.error;
  if (roomsResult.error) throw roomsResult.error;
  if (folioResult.error) throw folioResult.error;

  const auditClosed = upper(auditResult.data?.status) === "CLOSED";
  if (auditClosed) {
    return { response: fail("The checkout business day is already closed and cannot be automatically reinstated", 409) };
  }

  const turnover = turnoverResult.data || null;
  const originalRoomStatus = upper(booking.hotel_rooms?.status);
  const housekeepingStarted = ["IN_PROGRESS", "AWAITING_INSPECTION"].includes(upper(turnover?.task_status));
  const originalRoomRecoverable = Boolean(
    booking.room_id
    && ["DIRTY", "AVAILABLE"].includes(originalRoomStatus)
    && !housekeepingStarted
  );
  const alternatives = (roomsResult.data || [])
    .filter((room) => room.id !== booking.room_id)
    .sort((a, b) => {
      const aSame = clean(a.room_type) === clean(booking.hotel_rooms?.room_type) ? 0 : 1;
      const bSame = clean(b.room_type) === clean(booking.hotel_rooms?.room_type) ? 0 : 1;
      return aSame - bSame || clean(a.room_number).localeCompare(clean(b.room_number));
    });

  return {
    access,
    booking,
    operationalDate,
    turnover,
    folio: folioResult.data || null,
    originalRoomRecoverable,
    housekeepingStarted,
    alternatives,
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = clean(body.bookingId || body.booking_id);
    const action = upper(body.action || "PREPARE");
    if (!bookingId) return fail("bookingId required");
    if (!["PREPARE", "CONFIRM"].includes(action)) return fail("action must be PREPARE or CONFIRM");

    const context = await loadRecoveryContext(bookingId, request);
    if (context.response) return context.response;

    if (action === "PREPARE") {
      return NextResponse.json({
        success: true,
        recovery: {
          state: "READY_FOR_DECISION",
          bookingId: context.booking.id,
          guestName: context.booking.hotel_guests?.full_name || "Guest",
          checkedOutAt: context.booking.actual_check_out_at,
          businessDate: context.operationalDate.businessDate,
          originalRoom: context.booking.hotel_rooms || null,
          originalRoomRecoverable: context.originalRoomRecoverable,
          housekeepingStarted: context.housekeepingStarted,
          turnover: context.turnover,
          alternativeRooms: context.alternatives,
          suggestedRoomId: context.originalRoomRecoverable
            ? context.booking.room_id
            : context.alternatives[0]?.id || null,
          financialHistoryChanged: false,
          folioReopened: false,
          paymentsChanged: false,
          bookedDepartureChanged: false,
          folioReviewRequired: upper(context.folio?.status) === "CLOSED",
        },
        operationalDate: operationalDatePayload(context.operationalDate),
      });
    }

    const roomId = clean(body.roomId || body.room_id);
    const reason = clean(body.reason);
    if (!roomId) return fail("Choose the room the guest will occupy after reinstatement");
    if (reason.length < 8 || reason.length > 1000) {
      return fail("Explain the checkout correction in 8 to 1000 characters");
    }
    const allowedRoomIds = new Set([
      ...(context.originalRoomRecoverable && context.booking.room_id ? [context.booking.room_id] : []),
      ...context.alternatives.map((room) => room.id),
    ]);
    if (!allowedRoomIds.has(roomId)) {
      return fail("Selected room is no longer a safe reinstatement option", 409);
    }

    const { data: booking, error: rpcError } = await supabaseAdmin.rpc("hotel_reinstate_checkout", {
      p_organization_id: context.access.organizationId,
      p_booking_id: context.booking.id,
      p_room_id: roomId,
      p_business_date: context.operationalDate.businessDate,
      p_reason: reason,
    });
    if (rpcError) return fail(rpcError.message || "Checkout could not be reinstated", 409);

    const updatedBooking = Array.isArray(booking) ? booking[0] || null : booking;
    return NextResponse.json({
      success: true,
      booking: updatedBooking,
      recovery: {
        state: "REINSTATED",
        businessDate: context.operationalDate.businessDate,
        roomId,
        originalRoomChanged: roomId !== context.booking.room_id,
        financialHistoryChanged: false,
        folioReopened: false,
        paymentsChanged: false,
        bookedDepartureChanged: false,
        originalCheckoutPreserved: true,
        folioReviewRequired: upper(context.folio?.status) === "CLOSED",
      },
      operationalDate: operationalDatePayload(context.operationalDate),
    });
  } catch (error) {
    console.error("HOTEL_CHECKOUT_REINSTATEMENT_ERROR", error);
    return fail(error?.message || "Unable to prepare checkout recovery", 500);
  }
}
