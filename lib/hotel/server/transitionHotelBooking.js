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

  if (!normalized) {
    throw new HotelBookingTransitionError(
      `${label} is required`,
      400
    );
  }

  return normalized;
}

export async function transitionHotelBooking({
  supabase,
  organizationId,
  bookingId,
  action,
}) {
  if (!supabase) {
    throw new HotelBookingTransitionError(
      "Server database connection is required",
      500
    );
  }

  const scopedOrganizationId = requireValue(
    organizationId,
    "organizationId"
  );
  const scopedBookingId = requireValue(
    bookingId,
    "bookingId"
  );
  const normalizedAction = requireValue(
    action,
    "action"
  ).toUpperCase();
  const transition = BOOKING_TRANSITIONS[normalizedAction];

  if (!transition) {
    throw new HotelBookingTransitionError(
      `Unsupported hotel booking action: ${normalizedAction}`,
      400
    );
  }

  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from("hotel_bookings")
    .select(`
      id,
      organization_id,
      room_id,
      guest_id,
      status,
      check_in_date,
      check_out_date
    `)
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedBookingId)
    .maybeSingle();

  if (bookingError) {
    throw bookingError;
  }

  if (!booking) {
    throw new HotelBookingTransitionError(
      "Hotel booking not found for this organization",
      404
    );
  }

  const currentStatus = String(
    booking.status || ""
  ).toUpperCase();

  if (currentStatus !== transition.fromStatus) {
    throw new HotelBookingTransitionError(
      `Booking must be ${transition.fromStatus} before ${normalizedAction}`,
      409
    );
  }

  const changedAt = new Date().toISOString();

  const {
    data: updatedBooking,
    error: updateError,
  } = await supabase
    .from("hotel_bookings")
    .update({
      status: transition.toStatus,
      updated_at: changedAt,
    })
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedBookingId)
    .eq("status", transition.fromStatus)
    .select()
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updatedBooking) {
    throw new HotelBookingTransitionError(
      "Booking state changed before the transition completed",
      409
    );
  }

  if (booking.room_id) {
    const { error: roomError } = await supabase
      .from("hotel_rooms")
      .update({
        status: transition.roomStatus,
        updated_at: changedAt,
      })
      .eq("organization_id", scopedOrganizationId)
      .eq("id", booking.room_id);

    if (roomError) {
      throw roomError;
    }
  }

  if (
    normalizedAction === "CHECK_OUT" &&
    booking.room_id
  ) {
    const { error: housekeepingError } = await supabase
      .from("hotel_housekeeping_tasks")
      .insert({
        organization_id: scopedOrganizationId,
        room_id: booking.room_id,
        task_type: "CLEANING",
        task_status: "PENDING",
        scheduled_at: changedAt,
        created_at: changedAt,
      });

    if (housekeepingError) {
      throw housekeepingError;
    }
  }

  return updatedBooking;
}

export {
  BOOKING_TRANSITIONS,
  HotelBookingTransitionError,
};

export default transitionHotelBooking;
