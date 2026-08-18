import fs from "node:fs";

const capabilityPath = "lib/finance/accounts-receivable/capabilities/postCustomerPayment.js";
const servicePath = "lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService.js";
const helperPath = "lib/finance/marketing/projectCustomerPaymentMarketingOutcome.js";

for (const file of [capabilityPath, servicePath, helperPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing Finance attribution file: ${file}`);
}

const capability = fs.readFileSync(capabilityPath, "utf8");
const service = fs.readFileSync(servicePath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");

for (const signal of ["payment_id", "paymentId"]) {
  if (!capability.includes(signal)) throw new Error(`Payment capability missing canonical identity signal: ${signal}`);
}

for (const signal of [
  "projectCustomerPaymentMarketingOutcome",
  "marketing_outcome",
]) {
  if (!service.includes(signal)) throw new Error(`AR application service missing Marketing projection signal: ${signal}`);
}

for (const signal of [
  "MarketingBusinessOutcomeProjectionRuntime",
  'outcomeType: "PAYMENT"',
  "attribution_parent",
  "invoice_id",
  "allocation.amount",
  "CUSTOMER_PAYMENT_HAS_NO_INVOICE_ALLOCATION",
  "FINANCE_MARKETING_PAYMENT_PROJECTION_FAILED",
]) {
  if (!helper.includes(signal)) throw new Error(`Finance Marketing helper missing: ${signal}`);
}

if (helper.includes('"THB"') || helper.includes("'THB'")) {
  throw new Error("Finance Marketing attribution must not hardcode currency");
}

const combined = `${capability}\n${service}\n${helper}`;
if (/ManagedMediaSpendRuntime|MetaAdsRuntime|GoogleAdsRuntime|WalletRepository|reserveSpend|providerCreateCampaign/.test(combined)) {
  throw new Error("Finance attribution flow must not execute advertising spend, provider campaigns, or wallet actions");
}

console.log("PASS marketing Finance payment attribution audit");
