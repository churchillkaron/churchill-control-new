import { createOperatorAuthenticatedRouteReadCapability } from "@/lib/operator/runtime/OperatorAuthenticatedRouteReadCapability";

function hotelBookingsRead() {
  return createOperatorAuthenticatedRouteReadCapability({
    domain: "solutions",
    capability: "hotel_bookings",
    action: "read",
    name: "Hotel Bookings & Reservation Readiness",
    document: "hotel_booking",
    description: "Read the organization's canonical Hotel bookings with guest, room, operational-day, turnover, arrival-readiness, departure-readiness and payment/folio state. Use this for hotel reservations, arrivals, departures, check-in readiness and bookings needing attention.",
    endpoint: "/api/hotel/bookings/list",
    tags: ["solutions", "hotel", "bookings", "reservations", "arrivals", "departures", "guests", "readiness"],
    operatorAliases: [
      "hotel reservations",
      "hotel bookings",
      "bookings needing attention",
      "reservations needing attention",
      "today's arrivals",
      "today's departures",
      "guests checking in",
      "guests checking out",
      "arrival readiness",
      "departure readiness",
    ],
    operatorExamples: [
      "Which hotel reservations need attention today?",
      "Show today's arrivals and anything blocking check-in.",
      "Which guests are due to depart and have payment or folio issues?",
    ],
  });
}
export const SolutionsOperatorDomainRuntime = {
  domain: "solutions",
  name: "Solutions",
  version: "1.0.0",
  capabilities: {
    hotel_bookings: {
      read: async () => hotelBookingsRead(),
    },
  },
};

export default SolutionsOperatorDomainRuntime;
