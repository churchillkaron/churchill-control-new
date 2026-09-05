import {
  evaluateHotelArrivalReadiness,
  firstHotelArrivalBlockerMessage,
} from "@/lib/hotel/server/getHotelArrivalReadiness";
import {
  evaluateHotelDepartureReadiness,
  firstHotelDepartureBlockerMessage,
} from "@/lib/hotel/server/getHotelDepartureReadiness";

const BOOKING_TRANSITIONS = Object.freeze({
  CHECK_IN: Object.freeze({
    fromStatus: "RESERVED",
    toStatus: "CHECKED_IN",
    roomStatus: "OCCUPIED",
  }),
  CHECK_OUT: Object.freeze({
    fromStatus: "CHECKED_IN",
    toStatus: "CHECKED_OUT",
    roomStatus: "DIRTY",
  }),
});

class HotelBookingTransitionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "HotelBookingTransitionError";
    this.status = status;
  }
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HotelBookingTransitionError(`${label} is required`, 400);
  return normalized;
}

async function getDepartureReadiness({ supabase, organizationId, booking }) {
  const { data: folio, error: folioError } = await supabase
    .from("hotel_folios")
    .select("id,booking_id,currency_code,status,closed_at")
    .eq("organization_id", organizationId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (folioError) throw folioError;

  const [linesResult, transactionsResult] = await Promise.all([
    folio
      ? supabase
          .from("hotel_folio_lines")
          .select("folio_id,amount,tax_amount,voided_at")
          .eq("organization_id", organizationId)
          .eq("folio_id", folio.id)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("hotel_payment_transactions")
      .select("booking_id,status,transaction_type,processor_mode,finance_payment_id,amount,applied_amount,refunded_amount,currency_code")
      .eq("organization_id", organizationId)
      .eq("booking_id", booking.id),
  ]);
  if (linesResult.error) throw linesResult.error;
  if (transactionsResult.error) throw transactionsResult.error;

  return evaluateHotelDepartureReadiness({
    booking,
    folio: folio || null,
    folioLines: linesResult.data || [],
    transactions: transactionsResult.data || [],
  });
}

export async function transitionHotelBooking({ supabase, organizationId, bookingId, action }) {
  if (!supabase) throw new HotelBookingTransitionError("Server database connection is required", 500);

  const scopedOrganizationId = requireValue(organizationId, "organizationId");
  const scopedBookingId = requireValue(bookingId, "bookingId");
  const normalizedAction = requireValue(action, "action").toUpperCase();
  const transition = BOOKING_TRANSITIONS[normalizedAction];
  if (!transition) throw new HotelBookingTransitionError(`Unsupported hotel booking action: ${normalizedAction}`, 400);

  const { data: booking, error: bookingError } = await supabase
    .from("hotel_bookings")
    .select("*")
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedBookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new HotelBookingTransitionError("Hotel booking not found for this organization", 404);

  const currentStatus = String(booking.status || "").toUpperCase();
  if (currentStatus !== transition.fromStatus) {
    throw new HotelBookingTransitionError(`Booking must be ${transition.fromStatus} before ${normalizedAction}`, 409);
  }
  if (normalizedAction === "CHECK_IN" && !booking.room_id) {
    throw new HotelBookingTransitionError("A room must be assigned before check-in", 409);
  }

  if (normalizedAction === "CHECK_OUT") {
    const readiness = await getDepartureReadiness({
      supabase,
      organizationId: scopedOrganizationId,
      booking,
    });
    if (!readiness.can_check_out) {
      throw new HotelBookingTransitionError(firstHotelDepartureBlockerMessage(readiness), 409);
    }
  }

  const changedAt = new Date().toISOString();
  let acquiredRoomForCheckIn = false;

  if (normalizedAction === "CHECK_IN") {
    const { data: readyRoom, error: roomReadError } = await supabase
      .from("hotel_rooms")
      .select("id,status")
      .eq("organization_id", scopedOrganizationId)
      .eq("id", booking.room_id)
      .maybeSingle();
    if (roomReadError) throw roomReadError;
    if (!readyRoom) throw new HotelBookingTransitionError("Assigned room was not found for this organization", 404);
    if (String(readyRoom.status || "").toUpperCase() !== "AVAILABLE") {
      throw new HotelBookingTransitionError("Assigned room must be AVAILABLE before check-in", 409);
    }

    let governedGuest = null;
    if (booking.guest_id) {
      const { data: guest, error: guestError } = await supabase
        .from("hotel_guests")
        .select("id,identity_verified_at")
        .eq("organization_id", scopedOrganizationId)
        .eq("id", booking.guest_id)
        .maybeSingle();
      if (guestError) throw guestError;
      governedGuest = guest || null;
    }

    const readiness = evaluateHotelArrivalReadiness({
      ...booking,
      hotel_rooms: readyRoom,
      hotel_guests: governedGuest,
    });
    if (!readiness.can_check_in) {
      throw new HotelBookingTransitionError(firstHotelArrivalBlockerMessage(readiness), 409);
    }

    const { data: acquiredRoom, error: acquireError } = await supabase
      .from("hotel_rooms")
      .update({ status: "OCCUPIED", updated_at: changedAt })
      .eq("organization_id", scopedOrganizationId)
      .eq("id", booking.room_id)
      .eq("status", "AVAILABLE")
      .select("id")
      .maybeSingle();
    if (acquireError) throw acquireError;
    if (!acquiredRoom) throw new HotelBookingTransitionError("Room readiness changed before check-in completed", 409);
    acquiredRoomForCheckIn = true;
  }

  const { data: updatedBooking, error: updateError } = await supabase
    .from("hotel_bookings")
    .update({ status: transition.toStatus, updated_at: changedAt })
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedBookingId)
    .eq("status", transition.fromStatus)
    .select()
    .maybeSingle();

  if (updateError || !updatedBooking) {
    if (acquiredRoomForCheckIn) {
      await supabase
        .from("hotel_rooms")
        .update({ status: "AVAILABLE", updated_at: new Date().toISOString() })
        .eq("organization_id", scopedOrganizationId)
        .eq("id", booking.room_id)
        .eq("status", "OCCUPIED");
    }
    if (updateError) throw updateError;
    throw new HotelBookingTransitionError("Booking state changed before the transition completed", 409);
  }

  if (normalizedAction === "CHECK_OUT" && booking.room_id) {
    const { error: roomError } = await supabase
      .from("hotel_rooms")
      .update({ status: transition.roomStatus, updated_at: changedAt })
      .eq("organization_id", scopedOrganizationId)
      .eq("id", booking.room_id)
      .eq("status", "OCCUPIED");
    if (roomError) throw roomError;

    const { error: housekeepingError } = await supabase
      .from("hotel_housekeeping_tasks")
      .insert({
        organization_id: scopedOrganizationId,
        room_id: booking.room_id,
        booking_id: booking.id,
        task_type: "CLEANING",
        task_status: "PENDING",
        scheduled_at: changedAt,
        created_at: changedAt,
      });
    if (housekeepingError) throw housekeepingError;
  }

  return updatedBooking;
}

export { BOOKING_TRANSITIONS, HotelBookingTransitionError };
export default transitionHotelBooking;
