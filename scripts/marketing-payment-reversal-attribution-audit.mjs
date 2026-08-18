import fs from "node:fs";

const recoveryRuntimePath = "lib/marketing/intelligence/MarketingPaymentRecoveryRuntime.js";
const financeProjectionPath = "lib/finance/marketing/projectCustomerPaymentRecoveryMarketingOutcome.js";
const arServicePath = "lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService.js";

for (const file of [recoveryRuntimePath, financeProjectionPath, arServicePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing payment recovery attribution file: ${file}`);
}

const recovery = fs.readFileSync(recoveryRuntimePath, "utf8");
const projection = fs.readFileSync(financeProjectionPath, "utf8");
const ar = fs.readFileSync(arServicePath, "utf8");

for (const signal of [
  'eq("source_document_type", "CUSTOMER_PAYMENT")',
  'eq("outcome_type", "PAYMENT")',
  'outcomeType: status === "REFUNDED" ? "PAYMENT_REFUND" : "PAYMENT_REVERSAL"',
  'revenue: -Math.abs',
  'profit: -Math.abs',
  'quantity: 0',
  'original_attribution_id',
  'marketing-payment-recovery',
]) {
  if (!recovery.includes(signal)) throw new Error(`Payment recovery runtime missing: ${signal}`);
}

for (const signal of [
  "MarketingPaymentRecoveryRuntime",
  "CUSTOMER_PAYMENT_RECOVERY_ATTRIBUTION_CONTEXT_INCOMPLETE",
  "FINANCE_MARKETING_PAYMENT_RECOVERY_FAILED",
]) {
  if (!projection.includes(signal)) throw new Error(`Finance recovery projection missing: ${signal}`);
}

for (const signal of [
  "projectCustomerPaymentRecoveryMarketingOutcome",
  "reverseCustomerPaymentCommand",
  "marketing_outcome",
]) {
  if (!ar.includes(signal)) throw new Error(`Accounts Receivable recovery integration missing: ${signal}`);
}

const combined = `${recovery}\n${projection}\n${ar}`;
if (/ManagedMediaSpendRuntime|MetaAdsRuntime|GoogleAdsRuntime|WalletRepository|reserveSpend|walletDebit/.test(combined)) {
  throw new Error("Payment recovery attribution must not execute advertising spend or wallet actions");
}

console.log("PASS marketing payment reversal attribution audit");
