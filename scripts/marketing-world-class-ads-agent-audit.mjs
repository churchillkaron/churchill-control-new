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
  "SCALE_CANDIDATE",
  "capital_allocation_proposal",
  "next_baht_priority",
  "marginal_return_estimate: null",
  "recommended_budget_change: null",
  "can_recommend_budget_amount_without_marginal_evidence: false",
  "Average historical return must not be presented as the marginal return of the next baht",
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
if (/\.insert\(|\.update\(|\.delete\(/.test(route)) {
  throw new Error("Campaign intelligence route must remain read-only");
}

const requiredPageSignals = [
  "Profit After Media",
  "Profit / Ad Spend",
  "Next Baht Allocation",
  "Controlled Scale Proposal",
  "No budget amount is recommended until controlled increment history establishes a marginal-return curve",
  "explicit authorization",
];

for (const signal of requiredPageSignals) {
  if (!page.includes(signal)) throw new Error(`Ads Intelligence UI missing allocation/governance signal: ${signal}`);
}

if (/recommended_budget_change:\s*[1-9]/.test(intelligence)) {
  throw new Error("Ads Intelligence must not infer a positive budget change without validated marginal evidence");
}

console.log("PASS marketing world-class ads agent audit");
