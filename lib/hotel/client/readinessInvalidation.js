export const HOTEL_READINESS_CHANGED_EVENT = "avantiqo:hotel-readiness-changed";

export function notifyHotelReadinessChanged(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HOTEL_READINESS_CHANGED_EVENT, { detail }));
}
