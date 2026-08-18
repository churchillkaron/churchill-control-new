import fs from "node:fs";

const runtimePath = "lib/marketing/intelligence/MarketingBusinessOutcomeProjectionRuntime.js";
const eventsPath = "lib/marketing/events/registerMarketingOutcomeEvents.js";
const bootstrapPath = "lib/shared/bootstrap/registerSystemEvents.js";

for (const file of [runtimePath, eventsPath, bootstrapPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing marketing outcome projection file: ${file}`);
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const events = fs.readFileSync(eventsPath, "utf8");
const bootstrap = fs.readFileSync(bootstrapPath, "utf8");

for (const signal of [
  "NO_MARKETING_CAMPAIGN_ATTRIBUTION_CONTEXT",
  "MarketingOutcomeAttributionRuntime.record",
  "idempotencyKey",
  "marketingCampaignId",
  "sourceDocumentId",
]) {
  if (!runtime.includes(signal)) throw new Error(`Outcome projection missing control: ${signal}`);
}

for (const eventType of [
  "MARKETING_LEAD_QUALIFIED",
  "BUSINESS_BOOKING_CONFIRMED",
  "BUSINESS_RESERVATION_CONFIRMED",
  "BUSINESS_SALE_CONFIRMED",
  "BUSINESS_PAYMENT_RECEIVED",
  "BUSINESS_CONTRACT_SIGNED",
  "BUSINESS_REFUND_ISSUED",
]) {
  if (!events.includes(eventType)) throw new Error(`Outcome event bridge missing: ${eventType}`);
}

if (!bootstrap.includes("registerMarketingOutcomeEvents")) {
  throw new Error("Marketing outcome events are not registered in the shared system bootstrap");
}

if (/ManagedMediaSpendRuntime|WalletRuntime|executeProvider|MetaAdsRuntime|GoogleAdsRuntime/.test(runtime + events)) {
  throw new Error("Business-outcome projection must not authorize spend or execute advertising providers");
}

console.log("PASS marketing outcome projection audit");
