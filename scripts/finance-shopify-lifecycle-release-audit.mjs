import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Final Shopify Finance lifecycle closure release gate.
const [
  accountingSource,
  lifecycleSource,
  invoiceRefundCapabilitySource,
  reversalCapabilitySource,
  configurationRouteSource,
  reconciliationMigrationSource,
  reversalMigrationSource,
  atomicRefundMigrationSource,
] = await Promise.all([
  readFile(
    "lib/finance/accounts-receivable/runtime/customerPrepaymentAccounting.js",
    "utf8",
  ),
  readFile("lib/finance/integrations/ShopifyFinanceLifecycleRuntime.js", "utf8"),
  readFile(
    "lib/finance/accounts-receivable/capabilities/refundCustomerPrepaymentAgainstInvoice.js",
    "utf8",
  ),
  readFile(
    "lib/finance/accounts-receivable/capabilities/reverseCustomerPrepaymentApplication.js",
    "utf8",
  ),
  readFile(
    "app/api/administration/integrations/shopify/finance/route.js",
    "utf8",
  ),
  readFile(
    "supabase/migrations/20260817083000_shopify_finance_lifecycle_reconciliation.sql",
    "utf8",
  ),
  readFile(
    "supabase/migrations/20260817083205_finance_customer_prepayment_application_reversal.sql",
    "utf8",
  ),
  readFile(
    "supabase/migrations/20260817083643_finance_customer_prepayment_invoice_refund_atomic.sql",
    "utf8",
  ),
]);

const requiredPostingRules = [
  "CUSTOMER_UNAPPLIED_CASH_RECEIVED",
  "CUSTOMER_UNAPPLIED_CASH_APPLIED",
  "CUSTOMER_UNAPPLIED_CASH_REFUNDED",
];

for (const eventType of requiredPostingRules) {
  assert.match(
    accountingSource,
    new RegExp(`\\"${eventType}\\"`),
    `${eventType} must remain part of Shopify customer-prepayment readiness`,
  );
}
assert.doesNotMatch(
  accountingSource,
  /"CUSTOMER_PAYMENT_RECEIVED"/,
  "Shopify prepayment readiness must not depend on the retired customer-payment refund workaround",
);
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
  /refundCustomerPrepaymentAgainstInvoice/,
  "invoiced Shopify refunds must use the atomic customer-prepayment invoice-refund capability",
);
assert.match(
  lifecycleSource,
  /getCustomerPrepaymentAccountingReadiness/,
  "the worker must recheck canonical accounting readiness at execution time",
);
assert.match(
  lifecycleSource,
  /status:\s*"BLOCKED_ACCOUNTING_CONFIGURATION"/,
  "configuration drift must become a controlled replayable lifecycle block",
);
assert.match(
  lifecycleSource,
  /status:\s*"BLOCKED_TRANSACTION_CURRENCY_MISMATCH"/,
  "transaction/order currency mismatch must be explicitly blocked",
);
assert.match(
  lifecycleSource,
  /bankCurrency && bankCurrency !== orderCurrency/,
  "settlement-bank currency must remain aligned with the Shopify order currency",
);
assert.doesNotMatch(
  lifecycleSource,
  /BLOCKED_REFUND_REQUIRES_SETTLED_INVOICE/,
  "partially paid invoices must no longer be blocked from a valid applied-prepayment refund",
);
assert.doesNotMatch(
  lifecycleSource,
  /CUSTOMER_PAYMENT_RECEIVED/,
  "Shopify refunds must not reconstruct receipt journals through the retired workaround",
);
assert.match(
  lifecycleSource,
  /BLOCKED_REFUND_EXCEEDS_ACCOUNTED_PAYMENT/,
  "Shopify must refuse refunds that exceed the source payment's available and applied accounting balance",
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
  invoiceRefundCapabilitySource,
  /finance_refund_customer_prepayment_against_invoice_idempotent/,
  "the applied-prepayment refund capability must execute through the atomic Finance RPC",
);
assert.match(
  invoiceRefundCapabilitySource,
  /eventType:\s*"CUSTOMER_UNAPPLIED_CASH_APPLIED"/,
  "allocation reversal must reuse the canonical application posting rule",
);
assert.match(
  invoiceRefundCapabilitySource,
  /eventType:\s*"CUSTOMER_UNAPPLIED_CASH_REFUNDED"/,
  "cash refund must reuse the canonical prepayment refund posting rule",
);
assert.match(
  reversalCapabilitySource,
  /finance_reverse_customer_unapplied_cash_application_party_idempotent/,
  "the canonical application reversal capability must remain database governed",
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
  configurationRouteSource,
  /status === "OBSERVED_ONLY" \|\| status\.startsWith\("BLOCKED_"\) \|\| status\.startsWith\("PENDING_"\)/,
  "processed Shopify configuration blocks must remain eligible for replay after repair",
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
  reversalMigrationSource,
  /add column if not exists reversed_amount numeric not null default 0/i,
  "customer payment allocations must preserve partial reversal amounts",
);
assert.match(
  reversalMigrationSource,
  /allocated_amount - coalesce\(a\.reversed_amount, 0\)/i,
  "commercial reconciliation must use net payment allocation after reversals",
);
assert.match(
  reversalMigrationSource,
  /create or replace function public\.finance_reverse_customer_unapplied_cash_application_party_idempotent/,
  "the canonical prepayment allocation reversal RPC must remain present",
);
assert.match(
  reversalMigrationSource,
  /security invoker/i,
  "the prepayment allocation reversal RPC must remain SECURITY INVOKER",
);
assert.match(
  reversalMigrationSource,
  /grant execute on function public\.finance_reverse_customer_unapplied_cash_application_party_idempotent\([\s\S]*?to service_role;/i,
  "the prepayment allocation reversal RPC must remain service-role only",
);

assert.match(
  atomicRefundMigrationSource,
  /create or replace function public\.finance_refund_customer_prepayment_against_invoice_idempotent/,
  "partial-paid invoice refunds must remain owned by one atomic Finance RPC",
);
assert.match(
  atomicRefundMigrationSource,
  /finance_reverse_customer_unapplied_cash_application_party_idempotent/,
  "atomic invoice refund must reverse applied prepayment before returning cash",
);
assert.match(
  atomicRefundMigrationSource,
  /finance_issue_customer_credit_note_idempotent/,
  "atomic invoice refund must credit the receivable for the refunded sale amount",
);
assert.match(
  atomicRefundMigrationSource,
  /finance_refund_customer_unapplied_cash_party_idempotent/,
  "atomic invoice refund must return cash through the canonical prepayment refund primitive",
);
assert.match(
  atomicRefundMigrationSource,
  /security invoker/i,
  "atomic Shopify invoice refund must remain SECURITY INVOKER",
);
assert.match(
  atomicRefundMigrationSource,
  /grant execute on function public\.finance_refund_customer_prepayment_against_invoice_idempotent\([\s\S]*?to service_role;/i,
  "atomic Shopify invoice refund must remain service-role only",
);

console.log("FINANCE_SHOPIFY_LIFECYCLE_RELEASE_AUDIT=PASS");
console.log("FINANCE_SHOPIFY_PROVIDER_EXECUTION=SERVICE_DOMAIN");
console.log("FINANCE_SHOPIFY_ACCOUNTING_READINESS=BANK_PLUS_THREE_POSTING_RULES");
console.log("FINANCE_SHOPIFY_READINESS_ERRORS=CONFIGURATION_ONLY");
console.log("FINANCE_SHOPIFY_CONFIGURATION_DRIFT=BLOCKED_REPLAYABLE");
console.log("FINANCE_SHOPIFY_MULTICURRENCY=TRANSACTION_ORDER_BANK_ALIGNED");
console.log("FINANCE_SHOPIFY_PARTIAL_REFUND=ATOMIC_ALLOCATION_REVERSAL_CREDIT_AND_CASH");
console.log("FINANCE_SHOPIFY_FINANCE_MODE=READINESS_GUARDED");
console.log("FINANCE_SHOPIFY_RECONCILIATION=POST_ALLOCATION_BALANCE_GUARDED");
console.log("FINANCE_SHOPIFY_RECONCILIATION_RPC=SERVICE_ROLE_SECURITY_INVOKER");