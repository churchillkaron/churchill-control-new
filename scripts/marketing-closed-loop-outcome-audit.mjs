import fs from "node:fs";

const migrationPath = "supabase/migrations/20260818033000_marketing_closed_loop_outcome_attribution.sql";
const runtimePath = "lib/marketing/intelligence/MarketingOutcomeAttributionRuntime.js";
const routePath = "app/api/marketing/campaign-outcomes/route.js";
const intelligencePath = "app/api/marketing/campaign-intelligence/route.js";

for (const file of [migrationPath, runtimePath, routePath, intelligencePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing closed-loop marketing file: ${file}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const intelligence = fs.readFileSync(intelligencePath, "utf8");

for (const token of [
  "marketing_campaign_id",
  "managed_media_campaign_id",
  "provider_campaign_id",
  "outcome_type",
  "qualified",
  "idempotency_key",
  "confidence",
]) {
  if (!migration.includes(token)) throw new Error(`Outcome migration missing ${token}`);
}

if (!migration.includes("marketing_attribution_org_idempotency_uidx")) {
  throw new Error("Outcome attribution must enforce organization-scoped idempotency");
}

for (const token of [
  "requireCampaign",
  "requireManagedMediaCampaign",
  "onConflict: \"organization_id,idempotency_key\"",
  "attributed_revenue",
  "attributed_gross_profit",
  "qualified_conversions",
]) {
  if (!runtime.includes(token)) throw new Error(`Outcome runtime missing ${token}`);
}

if (!route.includes("requireOrganizationAccess")) {
  throw new Error("Outcome API must enforce organization access");
}
if (!route.includes("marketing.attribution.manage")) {
  throw new Error("Outcome API must require Marketing attribution authority");
}
if (/ManagedMediaSpendRuntime|WalletRuntime|executeProvider|MetaAdsRuntime|GoogleAdsRuntime/.test(route)) {
  throw new Error("Outcome recording API must not authorize or execute advertising spend");
}

if (!intelligence.includes("MarketingOutcomeAttributionRuntime.listByCampaigns")) {
  throw new Error("Ads Intelligence must load closed-loop campaign outcomes");
}
if (!intelligence.includes("provider_spend_amount")) {
  throw new Error("Ads Intelligence must use reconciled provider spend when linked");
}

console.log("PASS marketing closed-loop outcome audit");
