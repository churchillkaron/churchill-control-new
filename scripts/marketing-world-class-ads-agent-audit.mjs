import fs from "node:fs";

const intelligencePath = "lib/marketing/intelligence/buildAdsPortfolioIntelligence.js";
const routePath = "app/api/marketing/campaign-intelligence/route.js";
const pagePath = "app/(system)/workspace/[organizationId]/commercial/marketing/campaigns/whole/intelligence/page.jsx";

for (const file of [intelligencePath, routePath, pagePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing required Ads Intelligence file: ${file}`);
}

const intelligence = fs.readFileSync(intelligencePath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");

const requiredIntelligenceSignals = [
  "Attributed gross profit per advertising baht",
  "profit_after_media",
  "profit_on_ad_spend",
  "media_break_even_covered",
  "SCALE_CANDIDATE",
  "REPAIR_BEFORE_SCALE",
  "PROVE_GROSS_PROFIT_BEFORE_SCALE",
  "attributed gross profit exceeds measured media spend",
  "can_move_budget_without_authorization: false",
  "can_increase_spend_without_authorization: false",
  "can_activate_paid_provider_without_authorization: false",
];

for (const signal of requiredIntelligenceSignals) {
  if (!intelligence.includes(signal)) throw new Error(`Ads Intelligence missing control: ${signal}`);
}

if (!route.includes("requireOrganizationAccess")) {
  throw new Error("Campaign intelligence route must enforce organization access");
}
if (!route.includes("canUseMultiOrganizationMarketing")) {
  throw new Error("Campaign intelligence route must enforce multi-organization Marketing authority");
}
if (/ManagedMediaSpendRuntime|GoogleAdsRuntime|MetaProvider|executeProvider|\.insert\(|\.update\(|\.delete\(/.test(route)) {
  throw new Error("Campaign intelligence route must remain read-only and must not execute provider/spend/database mutations");
}

const requiredPageSignals = [
  "Profit After Media",
  "Profit / Ad Spend",
  "Gross Profit",
  "Moving budget, increasing spend or activating paid providers still requires explicit authorization",
];

for (const signal of requiredPageSignals) {
  if (!page.includes(signal)) throw new Error(`Ads Intelligence UI missing profit/governance signal: ${signal}`);
}

if (/provider activation or spend authorization/.test(page) && !page.includes("explicit authorization")) {
  throw new Error("Ads Intelligence UI must preserve explicit spend authorization language");
}

console.log("PASS marketing world-class ads agent audit");
