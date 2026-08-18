import fs from "node:fs";

const servicePath = "lib/inventory/fulfillment/returnSalesOrderFulfillment.js";
const marketingPath = "lib/marketing/intelligence/MarketingFulfillmentCostRecoveryRuntime.js";
const routePath = "app/api/inventory/fulfillment/sales-orders/return/route.js";

for (const file of [servicePath, marketingPath, routePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing fulfillment return recovery file: ${file}`);
}

const service = fs.readFileSync(servicePath, "utf8");
const marketing = fs.readFileSync(marketingPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");

for (const signal of [
  '.eq("source_document", "sales_order")',
  '.eq("type", "SALE")',
  'movementType: "ADJUSTMENT_IN"',
  'sourceDocument: "sales_order_return"',
  'referenceId: original.id',
  'postToFinance: false',
  'createJournalReversal({',
  'source_document", "INVENTORY_CONSUMPTION"',
  'return_scope: "FULL_FULFILLMENT"',
]) {
  if (!service.includes(signal)) {
    throw new Error(`Fulfillment return orchestration missing: ${signal}`);
  }
}

for (const signal of [
  '.eq("outcome_type", "FULFILLMENT_COGS")',
  'outcomeType: "FULFILLMENT_COGS_RECOVERY"',
  'quantity: 0',
  'revenue: 0',
  'cost: -originalCost',
  'profit: originalCost',
  'sourceDocumentType: "SALES_ORDER_FULFILLMENT_RETURN"',
  'marketing-fulfillment-cogs-recovery',
]) {
  if (!marketing.includes(signal)) {
    throw new Error(`Marketing fulfillment cost recovery missing: ${signal}`);
  }
}

for (const signal of [
  "requireOrganizationAccess",
  "returnSalesOrderFulfillment",
  "export async function POST",
]) {
  if (!route.includes(signal)) {
    throw new Error(`Fulfillment return API missing: ${signal}`);
  }
}

const combined = `${service}\n${marketing}\n${route}`;
if (/ManagedMediaSpendRuntime|MetaAdsRuntime|GoogleAdsRuntime|WalletRepository|spend_state|publishCampaign|activateCampaign/.test(combined)) {
  throw new Error("Fulfillment return recovery must not execute advertising spend, wallet, publish, or activation actions");
}

if (/fuzzy|customer_email|customer_name/i.test(marketing)) {
  throw new Error("Marketing fulfillment recovery must use exact document lineage only");
}

console.log("PASS sales fulfillment return recovery audit");
