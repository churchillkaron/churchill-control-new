import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  accountingSource,
  lifecycleSource,
  configurationRouteSource,
  reconciliationMigrationSource,
] = await Promise.all([
  readFile(
    "lib/finance/accounts-receivable/runtime/customerPrepaymentAccounting.js",
    "utf8",
  ),
  readFile("lib/finance/integrations/ShopifyFinanceLifecycleRuntime.js", "utf8"),
  readFile(
    "app/api/administration/integrations/shopify/finance/route.js",
    "utf8",
  ),
  readFile(
    "supabase/migrations/20260817083000_shopify_finance_lifecycle_reconciliation.sql",
    "utf8",
  ),
]);

const requiredPostingRules = [
  "CUSTOMER_UNAPPLIED_CASH_RECEIVED",
  "CUSTOMER_UNAPPLIED_CASH_APPLIED",
  "CUSTOMER_UNAPPLIED_CASH_REFUNDED",
  "CUSTOMER_PAYMENT_RECEIVED",
];

for (const eventType of requiredPostingRules) {
  assert.match(
    accountingSource,
    new RegExp(`\\"${eventType}\\"`),
    `${eventType} must remain part of Shopify customer-prepayment readiness`,
  );
}

assert.match(
  accountingSource,
  /if \(!isSemanticConfigurationError\(error\)\) throw error/,
  "bank readiness must not hide database or infrastructure failures as configuration gaps",
);
assert.match(
  accountingSource,
  /if \(!isMissingPostingRuleError\(error, eventType\)\) throw error/,
  "posting-rule readiness must not hide database or infrastructure failures as configuration gaps",
);
assert.match(
  accountingSource,
  /\.eq\("organization_id", organizationId\)/,
  "settlement-bank readiness must remain organization scoped",
);
assert.match(
  accountingSource,
  /\.eq\("entity_id", entityId\)/,
  "settlement-bank readiness must remain legal-entity scoped",
);
assert.match(
  accountingSource,
  /finance_account_id/,
  "settlement bank must remain linked to a Finance ledger account",
);

assert.match(
  lifecycleSource,
  /ServiceExecutionRuntime/,
  "Shopify lifecycle reads must remain behind the Service Domain execution runtime",
);
assert.match(
  lifecycleSource,
  /await executeService\(\{/,
  "Shopify lifecycle reads must execute through executeService",
);
assert.match(
  lifecycleSource,
  /const CAPABILITY = "commerce\.shopify\.order\.lifecycle\.read"/,
  "Shopify Finance must keep the governed lifecycle-read capability",
);
assert.doesNotMatch(
  lifecycleSource,
  /WalletRepository\.(?:debit|charge|spend|withdraw)/,
  "Shopify Finance must not bypass Service Domain usage with a direct wallet debit",
);
assert.match(
  lifecycleSource,
  /postCustomerPrepayment/,
  "Shopify payment inflows must use the canonical customer-prepayment capability",
);
assert.match(
  lifecycleSource,
  /applyCustomerPrepayment/,
  "Shopify fulfillment must use the canonical customer-prepayment application capability",
);
assert.match(
  lifecycleSource,
  /refundCustomerPrepayment/,
  "Shopify unapplied refunds must use the canonical customer-prepayment refund capability",
);
assert.match(
  lifecycleSource,
  /prepareCustomerPrepaymentJournal/,
  "Shopify invoiced refunds must use canonical Finance posting-rule journal preparation",
);
assert.match(
  lifecycleSource,
  /system_automation:\s*true/,
  "provider automation must remain explicitly marked as system automation instead of inventing human actors",
);
assert.match(
  lifecycleSource,
  /const settledInvoice = invoice \? await refreshInvoice\(invoice\.id\) : null/,
  "Shopify Finance reconciliation must use a fresh post-allocation invoice snapshot",
);
assert.match(
  lifecycleSource,
  /if \(invoice\) status = "INVOICE_OPEN"/,
  "open Shopify invoices must remain explicitly unreconciled",
);
assert.match(
  lifecycleSource,
  /invoice && blockedRefunds\.length === 0 && invoiceOutstanding <= 0\.005/,
  "Shopify Finance must not declare RECONCILED while the invoice remains outstanding",
);
assert.match(
  lifecycleSource,
  /invoice_outstanding_amount:\s*invoiceOutstanding/,
  "Shopify Finance lifecycle evidence must expose the final invoice outstanding amount",
);

assert.match(
  configurationRouteSource,
  /getCustomerPrepaymentAccountingReadiness/,
  "Shopify Finance configuration must use canonical accounting readiness",
);
assert.match(
  configurationRouteSource,
  /configured:\s*Boolean\(store\?\.entity_id && configuredBank && readiness\.ready\)/,
  "Shopify Finance must not report configured unless accounting readiness passes",
);
assert.match(
  configurationRouteSource,
  /if \(mode === "POST_TO_FINANCE"\) \{[\s\S]*?if \(!readiness\.ready\)/,
  "POST_TO_FINANCE must remain blocked when accounting readiness fails",
);
assert.match(
  configurationRouteSource,
  /status:\s*409/,
  "missing Finance configuration must remain a controlled conflict rather than a server failure",
);

assert.match(
  reconciliationMigrationSource,
  /create or replace function public\.claim_shopify_finance_lifecycle_events/,
  "Shopify Finance event claiming must remain database controlled",
);
assert.match(
  reconciliationMigrationSource,
  /security invoker/i,
  "Shopify Finance reconciliation RPCs must remain SECURITY INVOKER",
);
assert.match(
  reconciliationMigrationSource,
  /grant execute on function public\.claim_shopify_finance_lifecycle_events\(integer, integer\)[\s\S]*?to service_role;/i,
  "Shopify Finance event claiming must remain service-role only",
);
assert.match(
  reconciliationMigrationSource,
  /grant execute on function public\.commercial_sync_external_sales_order_lifecycle_atomic\([\s\S]*?\) to service_role;/i,
  "external sales-order lifecycle mutation must remain service-role only",
);

console.log("FINANCE_SHOPIFY_LIFECYCLE_RELEASE_AUDIT=PASS");
console.log("FINANCE_SHOPIFY_PROVIDER_EXECUTION=SERVICE_DOMAIN");
console.log("FINANCE_SHOPIFY_ACCOUNTING_READINESS=BANK_PLUS_FOUR_POSTING_RULES");
console.log("FINANCE_SHOPIFY_READINESS_ERRORS=CONFIGURATION_ONLY");
console.log("FINANCE_SHOPIFY_FINANCE_MODE=READINESS_GUARDED");
console.log("FINANCE_SHOPIFY_RECONCILIATION=POST_ALLOCATION_BALANCE_GUARDED");
console.log("FINANCE_SHOPIFY_RECONCILIATION_RPC=SERVICE_ROLE_SECURITY_INVOKER");
