import fs from "node:fs";

const helperPath = "lib/commercial/marketing/projectCommercialMarketingOutcome.js";
if (!fs.existsSync(helperPath)) throw new Error(`Missing Marketing helper: ${helperPath}`);

const helper = fs.readFileSync(helperPath, "utf8");

for (const signal of [
  "result.invoice?.id",
  "result.invoice_id",
  "result.customer_invoice_id",
  "invoiceId: resolvedInvoiceId",
  "generated_invoice_id",
]) {
  if (!helper.includes(signal)) {
    throw new Error(`Generated invoice lineage missing: ${signal}`);
  }
}

if (/ManagedMediaSpendRuntime|MetaAdsRuntime|GoogleAdsRuntime|WalletRepository/.test(helper)) {
  throw new Error("Invoice lineage repair must not execute advertising spend or wallet actions");
}

console.log("PASS generated invoice Marketing lineage audit");
