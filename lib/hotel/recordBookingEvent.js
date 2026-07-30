import { recordSystemEvent } from "@/lib/events/recordSystemEvent";

function requireEventInput({ organizationId, booking, eventType }) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!booking?.id) {
    throw new Error("booking.id required");
  }

  return {
    organizationId,
    type: eventType,
    idempotencyKey: `${eventType}:${booking.id}`,
    payload: booking,
  };
}

export async function recordBookingEvent({ organizationId, booking }) {
  return recordSystemEvent(
    requireEventInput({
      organizationId,
      booking,
      eventType: "BOOKING_CREATED",
    })
  );
}

export async function recordCheckinEvent({ organizationId, booking }) {
  return recordSystemEvent(
    requireEventInput({
      organizationId,
      booking,
      eventType: "CHECKIN_COMPLETED",
    })
  );
}

export async function recordCheckoutEvent({ organizationId, booking }) {
  return recordSystemEvent(
    requireEventInput({
      organizationId,
      booking,
      eventType: "CHECKOUT_COMPLETED",
    })
  );
}
