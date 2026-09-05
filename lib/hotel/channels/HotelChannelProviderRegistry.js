export const HOTEL_CHANNEL_PROVIDERS = Object.freeze([
  Object.freeze({
    id: "booking_com",
    name: "Booking.com",
    network: "Booking.com",
    connectionMode: "CERTIFIED_CONNECTIVITY",
    supports: Object.freeze(["RATES", "AVAILABILITY", "RESTRICTIONS", "RESERVATIONS"]),
    onboarding: "Partner connectivity approval and property mapping required",
  }),
  Object.freeze({
    id: "agoda",
    name: "Agoda",
    network: "Agoda",
    connectionMode: "CERTIFIED_CONNECTIVITY",
    supports: Object.freeze(["RATES", "AVAILABILITY", "RESTRICTIONS", "RESERVATIONS"]),
    onboarding: "Agoda connectivity credentials and property mapping required",
  }),
  Object.freeze({
    id: "expedia_group",
    name: "Expedia Group",
    network: "Expedia · Hotels.com · Vrbo lodging distribution where eligible",
    connectionMode: "CERTIFIED_CONNECTIVITY",
    supports: Object.freeze(["RATES", "AVAILABILITY", "RESTRICTIONS", "RESERVATIONS"]),
    onboarding: "Expedia Group lodging connectivity approval and property mapping required",
  }),
  Object.freeze({
    id: "trip_com",
    name: "Trip.com",
    network: "Trip.com Group",
    connectionMode: "CERTIFIED_CONNECTIVITY",
    supports: Object.freeze(["RATES", "AVAILABILITY", "RESTRICTIONS", "RESERVATIONS"]),
    onboarding: "Connectivity credentials and property mapping required",
  }),
  Object.freeze({
    id: "traveloka",
    name: "Traveloka",
    network: "Traveloka",
    connectionMode: "CERTIFIED_CONNECTIVITY",
    supports: Object.freeze(["RATES", "AVAILABILITY", "RESTRICTIONS", "RESERVATIONS"]),
    onboarding: "Connectivity credentials and property mapping required",
  }),
  Object.freeze({
    id: "airbnb",
    name: "Airbnb",
    network: "Airbnb",
    connectionMode: "CERTIFIED_CONNECTIVITY",
    supports: Object.freeze(["RATES", "AVAILABILITY", "RESTRICTIONS", "RESERVATIONS"]),
    onboarding: "Software partner eligibility and listing mapping required",
  }),
]);

export function getHotelChannelProvider(id) {
  const target = String(id || "").trim().toLowerCase();
  return HOTEL_CHANNEL_PROVIDERS.find((provider) => provider.id === target) || null;
}

export default HOTEL_CHANNEL_PROVIDERS;
