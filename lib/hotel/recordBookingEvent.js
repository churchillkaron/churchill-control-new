import { recordSystemEvent } from '@/lib/events/recordSystemEvent';

export async function recordBookingEvent({ tenantId, booking }) {
  return recordSystemEvent({
    tenantId,
    type: 'BOOKING_CREATED',
    payload: booking
  });
}

export async function recordCheckinEvent({ tenantId, booking }) {
  return recordSystemEvent({
    tenantId,
    type: 'CHECKIN_COMPLETED',
    payload: booking
  });
}

export async function recordCheckoutEvent({ tenantId, booking }) {
  return recordSystemEvent({
    tenantId,
    type: 'CHECKOUT_COMPLETED',
    payload: booking
  });
}
