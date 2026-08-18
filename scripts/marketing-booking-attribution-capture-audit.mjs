import fs from "node:fs";

const capturePath = "lib/marketing/intelligence/MarketingAttributionCaptureRuntime.js";
const bookingPath = "app/api/hotel/bookings/create/route.js";

for (const file of [capturePath, bookingPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing attribution capture file: ${file}`);
}

const capture = fs.readFileSync(capturePath, "utf8");
const booking = fs.readFileSync(bookingPath, "utf8");

for (const field of ["avq_oid", "avq_mid", "avq_mmcid", "avq_pid", "avq_pcid", "avq_sig"]) {
  if (!capture.includes(field)) throw new Error(`Capture runtime missing ${field}`);
}

if (!booking.includes("requireOrganizationAccess")) {
  throw new Error("Booking creation must remain organization-authorized");
}
if (!booking.includes("MarketingAttributionCaptureRuntime.fromObject")) {
  throw new Error("Booking creation must capture signed attribution context");
}
if (!booking.includes('outcomeType: "BOOKING"')) {
  throw new Error("Booking creation must project a BOOKING business outcome");
}
if (!booking.includes('sourceDocumentType: "hotel_booking"')) {
  throw new Error("Booking attribution must use deterministic hotel_booking source identity");
}
if (/ManagedMediaSpendRuntime|executeProvider|WalletRuntime|reserveAndCreate/.test(capture + booking)) {
  throw new Error("Attribution capture must never authorize spend, reserve wallet funds or execute providers");
}

console.log("PASS marketing booking attribution capture audit");
