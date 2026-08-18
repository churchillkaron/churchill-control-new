import { registerEvent } from "@/lib/shared/events/eventBus";
import { MarketingBusinessOutcomeProjectionRuntime } from "@/lib/marketing/intelligence/MarketingBusinessOutcomeProjectionRuntime";

const EVENTS = [
  "MARKETING_LEAD_CREATED",
  "MARKETING_LEAD_QUALIFIED",
  "BUSINESS_BOOKING_CONFIRMED",
  "BUSINESS_RESERVATION_CONFIRMED",
  "BUSINESS_SALE_CONFIRMED",
  "BUSINESS_PAYMENT_RECEIVED",
  "BUSINESS_DEPOSIT_RECEIVED",
  "BUSINESS_CONTRACT_SIGNED",
  "BUSINESS_REFUND_ISSUED",
  "BUSINESS_CANCELLATION_CONFIRMED",
];

for (const eventType of EVENTS) {
  registerEvent(eventType, async (payload = {}) => {
    return MarketingBusinessOutcomeProjectionRuntime.project({
      ...payload,
      event_type: payload.event_type || eventType,
    });
  });
}
