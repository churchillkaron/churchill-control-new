import fs from "node:fs";

const helperPath = "lib/commercial/marketing/projectCommercialMarketingOutcome.js";
const quotationPath = "app/api/commercial/sales/quotations/route.js";
const orderPath = "app/api/commercial/sales/orders/route.js";

for (const file of [helperPath, quotationPath, orderPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing commercial attribution file: ${file}`);
}

const helper = fs.readFileSync(helperPath, "utf8");
const quotations = fs.readFileSync(quotationPath, "utf8");
const orders = fs.readFileSync(orderPath, "utf8");

for (const signal of [
  "MarketingAttributionCaptureRuntime",
  "MarketingBusinessOutcomeProjectionRuntime",
  "attribution_parent",
  "COMMERCIAL_MARKETING_OUTCOME_PROJECTION_FAILED",
]) {
  if (!helper.includes(signal)) throw new Error(`Commercial projection helper missing: ${signal}`);
}

for (const signal of ["QUALIFIED_LEAD", "ACCEPTED_QUOTATION", "revenue: 0"]) {
  if (!quotations.includes(signal)) throw new Error(`Quotation lineage missing: ${signal}`);
}

for (const signal of ["ORDER_CREATED", "SALE", "FULFILLED_ORDER", "revenue: 0"]) {
  if (!orders.includes(signal)) throw new Error(`Sales order lineage missing: ${signal}`);
}

const combined = `${helper}\n${quotations}\n${orders}`;
if (/ManagedMediaSpendRuntime|MetaAdsRuntime|GoogleAdsRuntime|WalletRepository/.test(combined)) {
  throw new Error("Commercial attribution flow must not execute advertising spend or wallet actions");
}

console.log("PASS marketing commercial outcome lineage audit");
