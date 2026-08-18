import fs from "node:fs";

const helperPath = "lib/commercial/marketing/projectCommercialMarketingOutcome.js";
const ordersPath = "app/api/commercial/sales/orders/route.js";
const paymentPath = "lib/finance/marketing/projectCustomerPaymentMarketingOutcome.js";

for (const file of [helperPath, ordersPath, paymentPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing gross profit attribution file: ${file}`);
}

const helper = fs.readFileSync(helperPath, "utf8");
const orders = fs.readFileSync(ordersPath, "utf8");
const payment = fs.readFileSync(paymentPath, "utf8");

for (const signal of ["quantity = 1", "cost = 0", "profit = 0", "profit: number(profit, 0)"]) {
  if (!helper.includes(signal)) throw new Error(`Commercial Marketing helper missing economic field: ${signal}`);
}

for (const signal of [
  'outcomeType: "FULFILLMENT_COGS"',
  "quantity: 0",
  "cost: fulfillmentCost",
  "profit: -fulfillmentCost",
  'finance_cost_source: "INVENTORY_CONSUMPTION"',
]) {
  if (!orders.includes(signal)) throw new Error(`Fulfillment COGS attribution missing: ${signal}`);
}

for (const signal of [
  'outcomeType: "PAYMENT"',
  "revenue: allocation.amount",
  "profit: allocation.amount",
  'economic_component: "REALIZED_REVENUE"',
]) {
  if (!payment.includes(signal)) throw new Error(`Payment gross profit contribution missing: ${signal}`);
}

const combined = `${helper}\n${orders}\n${payment}`;
if (/ManagedMediaSpendRuntime|MetaAdsRuntime|GoogleAdsRuntime|WalletRepository/.test(combined)) {
  throw new Error("Gross profit attribution must not execute advertising spend or wallet actions");
}

console.log("PASS marketing gross profit attribution audit");
