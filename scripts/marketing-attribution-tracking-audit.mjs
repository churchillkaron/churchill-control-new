import fs from "node:fs";

const runtimePath = "lib/marketing/intelligence/MarketingAttributionTrackingRuntime.js";
const projectionPath = "lib/marketing/intelligence/MarketingBusinessOutcomeProjectionRuntime.js";
const routePath = "app/api/marketing/attribution-link/route.js";

for (const file of [runtimePath, projectionPath, routePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing marketing attribution file: ${file}`);
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const projection = fs.readFileSync(projectionPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");

for (const signal of [
  "MARKETING_ATTRIBUTION_SIGNING_SECRET",
  "createHmac",
  "timingSafeEqual",
  "avq_mid",
  "avq_oid",
  "avq_sig",
  "marketing_campaigns",
]) {
  if (!runtime.includes(signal)) throw new Error(`Attribution tracking runtime missing: ${signal}`);
}

if (!projection.includes("MarketingAttributionTrackingRuntime.verify")) {
  throw new Error("Business outcome projection must verify signed external attribution");
}
if (!projection.includes("ATTRIBUTION_ORGANIZATION_MISMATCH")) {
  throw new Error("Business outcome projection must reject cross-organization attribution");
}
if (!route.includes("requireOrganizationAccess") || !route.includes("canCreateMarketingCampaign")) {
  throw new Error("Attribution-link API must enforce organization and Marketing authority");
}

const forbidden = /ManagedMediaSpendRuntime|WalletRuntime|executeProvider|MetaAdsRuntime|GoogleAdsRuntime|reserveBudget|activateCampaign/;
if (forbidden.test(runtime) || forbidden.test(route)) {
  throw new Error("Attribution tracking must not execute or authorize paid media");
}

console.log("PASS marketing attribution tracking audit");
