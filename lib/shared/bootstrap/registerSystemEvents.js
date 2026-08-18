import "@/lib/inventory/procurement/events/registerProcurementEvents";
import "@/lib/approval/events/registerApprovalEvents";
import "@/lib/marketing/events/registerMarketingOutcomeEvents";

let initialized = false;

export function registerSystemEvents() {
  if (initialized) {
    return {
      success: true,
      registered: true,
      alreadyInitialized: true,
    };
  }

  initialized = true;

  if (process.env.NODE_ENV !== "production") console.log(
    "[SYSTEM_EVENTS_REGISTERED]"
  );

  return {
    success: true,
    registered: true,
  };
}
