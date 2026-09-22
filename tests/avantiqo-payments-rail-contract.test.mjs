import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const execution = fs.readFileSync(
  "lib/platform/payment-runtime/execution/PaymentExecutionRuntime.js",
  "utf8",
);
const rail = fs.readFileSync(
  "lib/platform/payment-runtime/providers/runtime/PaymentRailExecutionRuntime.js",
  "utf8",
);
const verifier = fs.readFileSync(
  "lib/platform/payment-runtime/verification/verifiers/StripePaymentIntentVerifier.js",
  "utf8",
);
const verificationRuntime = fs.readFileSync(
  "lib/platform/payment-runtime/verification/PaymentSettlementVerificationRuntime.js",
  "utf8",
);
const webhook = fs.readFileSync("app/api/billing/webhook/route.js", "utf8");
const cardUi = fs.readFileSync(
  "components/workspace/payment/forms/CreditCardPayment.jsx",
  "utf8",
);
const methodsApi = fs.readFileSync(
  "app/api/platform/payment-methods/route.js",
  "utf8",
);
const walletTopUp = fs.readFileSync(
  "components/workspace/engines/WalletTopUpEngine.jsx",
  "utf8",
);
const billingCheckout = fs.readFileSync(
  "app/api/billing/checkout/route.js",
  "utf8",
);
const moduleCatalog = fs.readFileSync(
  "lib/billing/moduleBillingCatalog.js",
  "utf8",
);
const stripeProvider = fs.readFileSync(
  "lib/platform/service-runtime/providers/stripe/StripeProvider.js",
  "utf8",
);
const stripeCredential = fs.readFileSync(
  "lib/platform/service-runtime/providers/stripe/StripeCredentialRegistration.js",
  "utf8",
);
const billingWorkspace = fs.readFileSync(
  "components/workspace/services/ServicesWorkspace.jsx",
  "utf8",
);
const paymentConfirmation = fs.readFileSync(
  "lib/platform/payment-runtime/confirmation/PaymentConfirmationRuntime.js",
  "utf8",
);
const reconciledSettlement = fs.readFileSync(
  "lib/platform/payment-runtime/reconciliation/ReconciledPaymentSettlementRuntime.js",
  "utf8",
);
const settlementRoute = fs.readFileSync(
  "app/api/internal/finance/payment-settlement/process/route.js",
  "utf8",
);
const organizationPaymentOnboarding = fs.readFileSync(
  "lib/platform/payment-runtime/onboarding/OrganizationPaymentOnboardingRuntime.js",
  "utf8",
);
const onboardingPage = fs.readFileSync(
  "app/(system)/onboarding/page.jsx",
  "utf8",
);
const stripeOnboardingRoute = fs.readFileSync(
  "app/api/payments/onboarding/stripe/route.js",
  "utf8",
);
const vercelConfig = fs.readFileSync("vercel.json", "utf8");

test("Avantiqo never collects raw card credentials", () => {
  assert.match(execution, /RAW_CARD_DATA_NOT_ACCEPTED/);
  assert.doesNotMatch(cardUi, /<input|<textarea|onChange=|useState\(/);
  assert.doesNotMatch(cardUi, /value\.card_number|value\.cvc|value\.cvv|value\.expiry/i);
  assert.match(cardUi, /never entered into or stored by Avantiqo/i);
});

test("card checkout stays behind the governed Stripe provider rail", () => {
  assert.match(rail, /StripeProvider\.createPaymentCheckout/);
  assert.match(rail, /domain:\s*"avantiqo_payment"/);
  assert.match(rail, /type:\s*"redirect"/);
});

test("Stripe webhook is not settlement authority", () => {
  assert.match(webhook, /PaymentConfirmationRuntime\.confirmPayment/);
  assert.match(webhook, /verificationSource:\s*"stripe\.payment_intent"/);
  assert.match(verifier, /StripeProvider\.retrievePaymentIntent/);
  assert.match(verifier, /intent\?\.status.*succeeded/s);
  assert.match(verifier, /metadata\?\.paymentId/);
  assert.match(verifier, /metadata\?\.organizationId/);
  assert.match(verificationRuntime, /StripePaymentIntentVerifier/);
});

test("bank transfer and PromptPay remain independently verified", () => {
  assert.match(rail, /type:\s*"bank_transfer"/);
  assert.match(rail, /status:\s*"awaiting_external_settlement"/);
  assert.match(rail, /PROMPTPAY_IDENTIFIER_NOT_CONFIGURED/);
  assert.match(rail, /status:\s*"requires_qr_generation"/);
});

test("payment methods API preserves UI compatibility", () => {
  assert.match(methodsApi, /methods,/);
  assert.match(methodsApi, /paymentMethods:\s*methods/);
});

test("wallet top up executes the canonical Avantiqo payment API", () => {
  assert.match(walletTopUp, /fetch\("\/api\/platform\/payment\/create"/);
  assert.match(walletTopUp, /source:\s*"wallet_topup"/);
  assert.match(walletTopUp, /window\.location\.assign\(result\.action\.url\)/);
  assert.doesNotMatch(walletTopUp, /payment_data:\s*paymentData/);
  assert.match(execution, /AVQ\$\{hex\.slice\(0, 16\)\.toUpperCase\(\)\}/);
  assert.match(execution, /payment_reference:\s*compactPaymentReference\(payment\.id\)/);
});

test("subscription checkout derives from canonical active module pricing", () => {
  assert.match(moduleCatalog, /from\("organization_modules"\)/);
  assert.match(moduleCatalog, /from\("platform_module_pricing"\)/);
  assert.match(moduleCatalog, /from\("billing_provider_price_mappings"\)/);
  assert.match(billingCheckout, /getOrganizationModuleBillingCatalog/);
  assert.match(billingCheckout, /lineItems:\s*catalog\.items\.map/);
  assert.match(billingCheckout, /unpricedModules/);
  assert.doesNotMatch(billingCheckout, /starter|enterprise|STRIPE_PRICE_STARTER|STRIPE_PRICE_PRO/i);
});

test("Stripe portal is a payment rail UI, not module catalog authority", () => {
  assert.match(stripeCredential, /STRIPE_BILLING_PORTAL_CONFIGURATION_ID/);
  assert.match(stripeCredential, /billing_portal_configuration_id/);
  assert.match(stripeProvider, /credential\?\.billing_portal_configuration_id/);
  assert.match(stripeProvider, /configuration:\s*configurationId/);
  assert.match(billingWorkspace, /Start \{label\.toLowerCase\(\)\}/);
  assert.match(billingWorkspace, /Canonical Avantiqo module pricing/);
});

test("only wallet top ups credit the Avantiqo wallet", () => {
  assert.match(paymentConfirmation, /paymentSource === "wallet_topup"/);
  const gate = paymentConfirmation.indexOf('paymentSource === "wallet_topup"');
  const topup = paymentConfirmation.indexOf("WalletRuntime.topup");
  assert.ok(gate >= 0 && topup > gate);
});

test("reconciled bank payments settle only from exact durable evidence", () => {
  assert.match(reconciledSettlement, /clean\(payment\.payment_reference\) \|\| clean\(payment\.id\)/);
  assert.match(reconciledSettlement, /\.eq\("reference_number", reference\)/);
  assert.match(reconciledSettlement, /\.not\("reconciled_statement_id", "is", null\)/);
  assert.match(reconciledSettlement, /\.not\("reconciled_at", "is", null\)/);
  assert.match(reconciledSettlement, /matches\.length !== 1/);
  assert.match(reconciledSettlement, /verificationSource:\s*"finance\.bank_reconciliation"/);
  assert.match(settlementRoute, /process\.env\.CRON_SECRET/);
  assert.match(vercelConfig, /\/api\/internal\/finance\/payment-settlement\/process/);
});

test("customer card payments are organization merchant scoped", () => {
  assert.match(rail, /organization_payment_provider_accounts/);
  assert.match(rail, /provider_connection_id/);
  assert.match(rail, /connectedAccountId:\s*merchant\.provider_account_id/);
  assert.match(execution, /provider_account_id:\s*action\.provider_account_id/);
  assert.match(verifier, /connectedAccountId:\s*connectedAccountId \|\| null/);
});

test("customer payment onboarding stays separate from platform billing", () => {
  assert.match(organizationPaymentOnboarding, /purpose:\s*"merchant_payments"/);
  assert.match(organizationPaymentOnboarding, /paymentMethod:\s*"bank_transfer"/);
  assert.match(organizationPaymentOnboarding, /paymentMethod:\s*"credit_card"/);
  assert.match(organizationPaymentOnboarding, /paymentMethod:\s*"qr_payment"/);
  assert.match(organizationPaymentOnboarding, /finance_banking_integrations/);
  assert.match(onboardingPage, /Will this organization accept payments from customers\?/);
  assert.match(onboardingPage, /Bank transfer/);
  assert.match(onboardingPage, /Card payments/);
  assert.match(onboardingPage, /PromptPay \/ QR/);
  assert.match(onboardingPage, /label:\s*"Review"/);
  assert.doesNotMatch(onboardingPage, /label:\s*"Payments"/);
  assert.match(stripeOnboardingRoute, /Organization owner access required/);
  assert.match(stripeOnboardingRoute, /https:\/\/avantiqo\.ai/);
});
