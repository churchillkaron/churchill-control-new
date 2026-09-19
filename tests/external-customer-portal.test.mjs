import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260919052423_external_customer_portal.sql", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../lib/customer-portal/CustomerPortalRuntime.js", import.meta.url), "utf8");
const settlement = fs.readFileSync(new URL("../lib/customer-portal/CustomerPortalPaymentSettlementRuntime.js", import.meta.url), "utf8");
const access = fs.readFileSync(new URL("../app/customer-portal/access/route.js", import.meta.url), "utf8");
const checkout = fs.readFileSync(new URL("../app/api/customer-portal/checkout/route.js", import.meta.url), "utf8");
const invoicePdf = fs.readFileSync(new URL("../app/api/customer-portal/invoices/[invoiceId]/pdf/route.js", import.meta.url), "utf8");
const messages = fs.readFileSync(new URL("../app/api/customer-portal/messages/route.js", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../app/api/billing/webhook/route.js", import.meta.url), "utf8");
const secretary = fs.readFileSync(new URL("../lib/operator/secretary/SecretaryMessageConversationRuntime.js", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../lib/operator/secretary/SecretaryBusinessAgreementExecutionRuntime.js", import.meta.url), "utf8");
const payment = fs.readFileSync(new URL("../lib/finance/accounts-receivable/capabilities/postCustomerPayment.js", import.meta.url), "utf8");

test("portal access is opaque, hashed, one-time and server-only", () => {
  assert.match(runtime, /randomBytes\(32\)/);
  assert.match(runtime, /createHash\("sha256"\)/);
  assert.match(runtime, /consumed_at/);
  assert.match(access, /httpOnly: true/);
  assert.match(access, /sameSite: "lax"/);
  assert.match(migration, /enable row level security/g);
  assert.match(migration, /revoke all .* from anon, authenticated/gi);
});

test("portal reads are party scoped", () => {
  assert.match(runtime, /eq\("customer_party_id", partyId\)/);
  assert.match(runtime, /eq\("party_id", partyId\)/);
  assert.match(runtime, /AVANTIQO_EXTERNAL_CUSTOMER_PORTAL_V1/);
});

test("bookings and invoices become payable only from authoritative amounts", () => {
  assert.match(runtime, /ensurePortalInvoicePaymentRequests/);
  assert.match(runtime, /ensurePortalBookingPaymentRequest/);
  assert.match(runtime, /\["prepaid", "per_visit", "recurring"\]/);
  assert.match(runtime, /Number\(billing\.amount\) > 0/);
  assert.match(bridge, /billing_amount/);
  assert.match(secretary, /billing_amount and billing_currency_code may be populated only when an exact price and currency are explicitly evidenced/);
});

test("card checkout is scoped to the exact portal session and payment request", () => {
  assert.match(checkout, /resolveCustomerPortalSession/);
  assert.match(checkout, /getPortalPaymentRequest/);
  assert.match(checkout, /payment_method_types: \["card"\]/);
  assert.match(checkout, /portalPaymentRequestId/);
  assert.match(checkout, /A single default settlement bank account is required/);
});

test("Stripe webhook is the authority for paid state and finance settlement", () => {
  assert.match(webhook, /customer_portal/);
  assert.match(webhook, /finalizeCustomerPortalCardPayment/);
  assert.match(settlement, /session\.payment_status !== "paid"/);
  assert.match(settlement, /CUSTOMER_PORTAL_STRIPE_AMOUNT_MISMATCH/);
  assert.match(settlement, /CUSTOMER_PORTAL_STRIPE_CURRENCY_MISMATCH/);
  assert.match(settlement, /postCustomerPayment/);
  assert.match(settlement, /postCustomerPrepayment/);
  assert.match(payment, /system_automation === true/);
});

test("portal customers can send messages into canonical Communications", () => {
  assert.match(messages, /communication_conversations/);
  assert.match(messages, /communication_messages/);
  assert.match(messages, /provider: "customer_portal"/);
  assert.match(messages, /direction: "INBOUND"/);
});

test("confirmed message booking receives secure portal access", () => {
  assert.match(bridge, /createCustomerPortalAccessLink/);
  assert.match(bridge, /portal_access/);
  assert.match(secretary, /customer_portal_url/);
  assert.match(secretary, /card payment is available in the portal/);
});

test("hotel bookings reuse canonical Hotel gateway settlement", () => {
  assert.match(runtime, /hotel_guests/);
  assert.match(runtime, /hotel_bookings/);
  assert.match(runtime, /source_type: "HOTEL_BOOKING"/);
  assert.match(checkout, /hotel_payment_transactions/);
  assert.match(checkout, /processor_mode: "AVANTIQO_GATEWAY"/);
  assert.match(checkout, /domain: "hotel"/);
  assert.match(checkout, /guestResult\.data\?\.party_id !== session\.party_id/);
  assert.match(webhook, /portalPaymentRequestId/);
  assert.match(webhook, /hotel_finalize_gateway_payment_with_finance/);
});

test("customer invoice and receipt PDFs reverify exact portal ownership", () => {
  assert.match(invoicePdf, /resolveCustomerPortalSession/);
  assert.match(invoicePdf, /eq\("organization_id", session\.organization_id\)/);
  assert.match(invoicePdf, /eq\("party_id", session\.party_id\)/);
  assert.match(invoicePdf, /renderCustomerInvoicePdf/);
  assert.match(invoicePdf, /"Cache-Control": "private, no-store"/);
});
