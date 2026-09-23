import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260919052423_external_customer_portal.sql", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../lib/customer-portal/CustomerPortalRuntime.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../app/customer-portal/page.jsx", import.meta.url), "utf8");
const settlement = fs.readFileSync(new URL("../lib/customer-portal/CustomerPortalPaymentSettlementRuntime.js", import.meta.url), "utf8");
const access = fs.readFileSync(new URL("../app/customer-portal/access/route.js", import.meta.url), "utf8");
const checkout = fs.readFileSync(new URL("../app/api/customer-portal/checkout/route.js", import.meta.url), "utf8");
const invoicePdf = fs.readFileSync(new URL("../app/api/customer-portal/invoices/[invoiceId]/pdf/route.js", import.meta.url), "utf8");
const messages = fs.readFileSync(new URL("../app/api/customer-portal/messages/route.js", import.meta.url), "utf8");
const preferences = fs.readFileSync(new URL("../app/api/customer-portal/preferences/route.js", import.meta.url), "utf8");
const quotationResponse = fs.readFileSync(new URL("../app/api/customer-portal/quotations/respond/route.js", import.meta.url), "utf8");
const walletApply = fs.readFileSync(new URL("../app/api/customer-portal/wallet/apply/route.js", import.meta.url), "utf8");
const arService = fs.readFileSync(new URL("../lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService.js", import.meta.url), "utf8");
const quotationResponseMigration = fs.readFileSync(new URL("../supabase/migrations/20260920032520_customer_portal_quotation_response.sql", import.meta.url), "utf8");
const webhook = fs.readFileSync(new URL("../app/api/billing/webhook/route.js", import.meta.url), "utf8");
const secretary = fs.readFileSync(new URL("../lib/operator/secretary/SecretaryMessageConversationRuntime.js", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../lib/operator/secretary/SecretaryBusinessAgreementExecutionRuntime.js", import.meta.url), "utf8");
const payment = fs.readFileSync(new URL("../lib/finance/accounts-receivable/capabilities/postCustomerPayment.js", import.meta.url), "utf8");
const quotationService = fs.readFileSync(new URL("../lib/commercial/quotations/QuotationService.js", import.meta.url), "utf8");
const invoiceCreate = fs.readFileSync(new URL("../lib/finance/accounts-receivable/documents/createCustomerInvoice.js", import.meta.url), "utf8");
const hotelBookingCreate = fs.readFileSync(new URL("../app/api/hotel/bookings/create/route.js", import.meta.url), "utf8");
const salesOrderConfirm = fs.readFileSync(new URL("../lib/commercial/sales/ConfirmSalesOrderService.js", import.meta.url), "utf8");
const creditPortalMigration = fs.readFileSync(new URL("../supabase/migrations/20260920034403_customer_portal_credit_application.sql", import.meta.url), "utf8");
const atomicExchangeMigration = fs.readFileSync(new URL("../supabase/migrations/20260920112000_customer_portal_atomic_access_exchange.sql", import.meta.url), "utf8");
const atomicProvisionMigration = fs.readFileSync(new URL("../supabase/migrations/20260920114500_customer_portal_atomic_access_provisioning.sql", import.meta.url), "utf8");
const inviteDelivery = fs.readFileSync(new URL("../lib/customer-portal/CustomerPortalInviteDeliveryRuntime.js", import.meta.url), "utf8");
const communicationDelivery = fs.readFileSync(new URL("../lib/commercial/communications/CommunicationDeliveryRuntime.js", import.meta.url), "utf8");

const bookingRequest = fs.readFileSync(new URL("../app/api/customer-portal/bookings/request/route.js", import.meta.url), "utf8");
const portalCommunication = fs.readFileSync(new URL("../lib/customer-portal/CustomerPortalCommunicationRuntime.js", import.meta.url), "utf8");

const servicePlansRoute = fs.readFileSync(new URL("../app/api/service-management/plans/route.js", import.meta.url), "utf8");

const secretaryMessages = fs.readFileSync(new URL("../lib/operator/secretary/SecretaryMessageConversationRuntime.js", import.meta.url), "utf8");


test("portal access is opaque, hashed, one-time and server-only", () => {
  assert.match(runtime, /randomBytes\(32\)/);
  assert.match(runtime, /createHash\("sha256"\)/);
  assert.match(atomicExchangeMigration, /consumed_at/);
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

test("customer commercial relationship stays party scoped across quotations and loyalty", () => {
  assert.match(runtime, /commercial_quotations/);
  assert.match(runtime, /customer_loyalty_accounts/);
  assert.match(runtime, /sales_orders/);
  assert.match(runtime, /quotations: quotationsResult\.data \|\| \[\]/);
  assert.match(runtime, /loyalty_accounts: loyaltyResult\.data \|\| \[\]/);
  assert.match(runtime, /sales_orders: salesOrdersResult\.data \|\| \[\]/);
});

test("customer wallet is derived from posted Finance balances instead of synthetic portal credit", () => {
  assert.match(runtime, /finance_customer_unapplied_cash/);
  assert.match(runtime, /finance_customer_credits/);
  assert.match(runtime, /balance_type: "PREPAYMENT"/);
  assert.match(runtime, /balance_type: "CUSTOMER_CREDIT"/);
  assert.match(runtime, /finance_backed: true/);
});

test("booking-scoped portal links rotate older unused links atomically before replacement", () => {
  assert.match(runtime, /p_source_type: normalizedSourceType/);
  assert.match(runtime, /p_source_id: normalizedSourceId/);
  assert.match(atomicProvisionMigration, /set revoked_at = v_now/);
  assert.match(atomicProvisionMigration, /link\.consumed_at is null/);
  assert.match(atomicProvisionMigration, /link\.revoked_at is null/);
  assert.match(atomicProvisionMigration, /pg_advisory_xact_lock/);
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
  assert.match(messages, /createCustomerPortalInboundMessage/);
  assert.match(portalCommunication, /communication_conversations/);
  assert.match(portalCommunication, /communication_messages/);
  assert.match(portalCommunication, /provider: "customer_portal"/);
  assert.match(portalCommunication, /direction: "INBOUND"/);
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


test("customer communication preferences are portal-session scoped and update the canonical contact profile", () => {
  assert.match(runtime, /secretary_contact_profiles/);
  assert.match(runtime, /communication_preferences/);
  assert.match(preferences, /resolveCustomerPortalSession/);
  assert.match(preferences, /secretary_contact_profiles/);
  assert.match(preferences, /onConflict: "organization_id,party_id"/);
  assert.match(preferences, /customer_portal_self_service/);
});


test("customer quotation response is party-scoped, atomic and customer-attributed", () => {
  assert.match(quotationResponse, /resolveCustomerPortalSession/);
  assert.match(quotationResponse, /commercial_customer_respond_quotation_atomic/);
  assert.match(quotationResponseMigration, /quotation\.party_id = p_party_id/);
  assert.match(quotationResponseMigration, /Only sent quotations can receive a customer response/);
  assert.match(quotationResponseMigration, /Expired quotation cannot be accepted or rejected/);
  assert.match(quotationResponseMigration, /COMMERCIAL_QUOTATION_ACCEPTED_BY_CUSTOMER/);
  assert.match(quotationResponseMigration, /customer_attributed', true/);
  assert.match(quotationResponseMigration, /revoke all on function public\.commercial_customer_respond_quotation_atomic/);
  assert.match(quotationResponseMigration, /to service_role/);
});


test("customer prepaid wallet can settle its own matching invoice through canonical Finance", () => {
  assert.match(walletApply, /resolveCustomerPortalSession/);
  assert.match(walletApply, /finance_customer_unapplied_cash/);
  assert.match(walletApply, /eq\("party_id", session\.party_id\)/);
  assert.match(walletApply, /applyCustomerPrepaymentSystemCommand/);
  assert.match(walletApply, /applyCustomerPrepaymentSystemCommand/);
  assert.match(arService, /applyCustomerPrepaymentSystemCommand/);
  assert.match(arService, /system_automation: true/);
  assert.match(walletApply, /resolveOrganizationTimeContext/);
  assert.match(walletApply, /CUSTOMER_PORTAL_WALLET_APPLIED/);
  assert.match(walletApply, /customer_attributed: true/);
});


test("customer portal sign out revokes the server session and expires the http-only cookie", () => {
  assert.match(runtime, /revokeCustomerPortalSession/);
  assert.match(runtime, /revoked_at: revokedAt/);
  assert.match(access, /httpOnly: true/);
  const sessionRoute = fs.readFileSync(new URL("../app/api/customer-portal/session/route.js", import.meta.url), "utf8");
  assert.match(sessionRoute, /export async function DELETE/);
  assert.match(sessionRoute, /revokeCustomerPortalSession/);
  assert.match(sessionRoute, /maxAge: 0/);
});


test("customer relationship lifecycle provisions portal access outside Secretary bookings", () => {
  assert.match(runtime, /provisionCustomerPortalAccess/);
  assert.match(quotationService, /action === "SEND"/);
  assert.match(quotationService, /sourceType: "COMMERCIAL_QUOTATION"/);
  assert.match(invoiceCreate, /canonicalInvoiceId = data\?\.invoice\?\.id/);
  assert.match(invoiceCreate, /sourceType: "CUSTOMER_INVOICE"/);
  assert.match(hotelBookingCreate, /hotel_guests/);
  assert.match(hotelBookingCreate, /sourceType: "HOTEL_BOOKING"/);
});

test("portal provisioning failure does not falsely fail an already committed business transaction", () => {
  assert.match(runtime, /CUSTOMER_PORTAL_PROVISIONING_ERROR/);
  assert.match(runtime, /provisioned: false/);
  assert.match(invoiceCreate, /portal_provisioning/);
  assert.match(quotationService, /portal_provisioning/);
  assert.match(hotelBookingCreate, /portal_provisioning/);
});


test("confirmed direct sales orders provision the same customer portal relationship", () => {
  assert.match(salesOrderConfirm, /commercial_confirm_sales_order_atomic/);
  assert.match(salesOrderConfirm, /from\("sales_orders"\)/);
  assert.match(salesOrderConfirm, /select\("id,party_id"\)/);
  assert.match(salesOrderConfirm, /sourceType: "SALES_ORDER"/);
  assert.match(salesOrderConfirm, /portal_provisioning/);
});


test("customer credit wallet application uses an active portal session instead of a fake staff actor", () => {
  assert.match(walletApply, /finance_customer_credits/);
  assert.match(walletApply, /finance_apply_customer_credit_portal_idempotent/);
  assert.match(walletApply, /p_portal_session_id: session\.id/);
  assert.match(creditPortalMigration, /customer_portal_sessions session/);
  assert.match(creditPortalMigration, /session\.revoked_at is null/);
  assert.match(creditPortalMigration, /session\.expires_at > now\(\)/);
  assert.match(creditPortalMigration, /null,\s+btrim\(p_idempotency_key\)/);
  assert.match(creditPortalMigration, /'actor_type', 'customer_portal'/);
  assert.match(creditPortalMigration, /from public, anon, authenticated/);
  assert.match(creditPortalMigration, /to service_role/);
});

test("wallet audit failure cannot turn an already applied balance into a false transaction failure", () => {
  assert.match(walletApply, /CUSTOMER_PORTAL_WALLET_EVENT_FAILED/);
  assert.match(walletApply, /return \{ recorded: false/);
  assert.match(walletApply, /portal_audit: audit/);
});


test("customer portal access link redemption is atomic under concurrent requests", () => {
  assert.match(runtime, /customer_portal_exchange_access_token_atomic/);
  assert.match(atomicExchangeMigration, /for update/);
  assert.match(atomicExchangeMigration, /set consumed_at = v_now/);
  assert.match(atomicExchangeMigration, /insert into public\.customer_portal_sessions/);
  assert.match(atomicExchangeMigration, /CUSTOMER_PORTAL_ACCESS_INVALID/);
  assert.match(atomicExchangeMigration, /to service_role/);
  const exchangeStart = runtime.indexOf("export async function exchangeCustomerPortalAccessToken");
  const exchangeEnd = runtime.indexOf("export async function resolveCustomerPortalSession", exchangeStart);
  const exchangeSection = runtime.slice(exchangeStart, exchangeEnd);
  assert.doesNotMatch(exchangeSection, /customer_portal_access_links/);
});


test("customer portal session resolution atomically validates revocation and expiry while touching last_seen", () => {
  const start = runtime.indexOf("export async function resolveCustomerPortalSession");
  const end = runtime.indexOf("export async function revokeCustomerPortalSession", start);
  const section = runtime.slice(start, end);
  assert.match(section, /update\(\{ last_seen_at: now \}\)/);
  assert.match(section, /eq\("session_token_hash", hash\(normalized\)\)/);
  assert.match(section, /is\("revoked_at", null\)/);
  assert.match(section, /gt\("expires_at", now\)/);
  assert.match(section, /select\("\*"\)/);
  assert.doesNotMatch(section, /const session = await one/);
});


test("external portal payload minimizes database columns instead of exposing whole finance and hotel records", () => {
  const loadStart = runtime.indexOf("export async function loadCustomerPortalData");
  const loadEnd = runtime.indexOf("export async function getPortalPaymentRequest", loadStart);
  const section = runtime.slice(loadStart, loadEnd);
  assert.doesNotMatch(section, /from\("customer_invoices"\)\.select\("\*"\)/);
  assert.doesNotMatch(section, /from\("customer_payments"\)\.select\("\*"\)/);
  assert.doesNotMatch(section, /from\("hotel_bookings"\)[\s\S]*?\.select\("\*"\)/);
  assert.doesNotMatch(section, /from\("customer_loyalty_accounts"\)[\s\S]*?\.select\("\*"\)/);
  assert.doesNotMatch(section, /from\("customer_portal_payment_requests"\)[\s\S]*?\.select\("\*"\)/);
  assert.match(section, /bookings: plans\.map/);
});


test("non-hotel customer checkout is idempotent and reuses an active provider session", () => {
  assert.match(checkout, /paymentRequest\.provider_session_id/);
  assert.match(checkout, /checkout\.sessions\.retrieve\(paymentRequest\.provider_session_id\)/);
  assert.match(checkout, /reused: true/);
  assert.match(checkout, /idempotencyKey: `customer-portal-checkout:\$\{paymentRequest\.id\}`/);
});


test("customer portal payment return messaging does not claim settlement before webhook proof", () => {
  assert.match(page, /Payment submitted\. We are confirming settlement now/);
  assert.match(page, /updates only after verified payment confirmation/);
  assert.match(page, /Payment was cancelled\. No portal balance was marked paid/);
});

test("expired sent quotations are visibly non-actionable in the customer portal", () => {
  assert.match(page, /function quotationExpired/);
  assert.match(page, /SENT" && quotationExpired\(quote\)/);
  assert.match(page, /SENT" && !quotationExpired\(quote\)/);
});


test("authenticated customer portal mutations enforce same-origin browser requests", () => {
  assert.match(runtime, /export function isCustomerPortalSameOriginRequest/);
  assert.match(runtime, /sec-fetch-site/);
  assert.match(runtime, /fetchSite === "cross-site"/);
  assert.match(runtime, /new URL\(origin\)\.origin === new URL\(request\.url\)\.origin/);
  for (const source of [messages, preferences, quotationResponse, walletApply, checkout]) {
    assert.match(source, /isCustomerPortalSameOriginRequest/);
    assert.match(source, /Cross-origin customer portal mutation denied/);
  }
  const sessionRoute = fs.readFileSync(new URL("../app/api/customer-portal/session/route.js", import.meta.url), "utf8");
  assert.match(sessionRoute, /export async function DELETE/);
  assert.match(sessionRoute, /isCustomerPortalSameOriginRequest/);
});


test("customer portal invitation provisioning is atomic per Party and source", () => {
  assert.match(runtime, /customer_portal_create_access_link_atomic/);
  assert.match(atomicProvisionMigration, /pg_advisory_xact_lock/);
  assert.match(atomicProvisionMigration, /update public\.customer_portal_access_links/);
  assert.match(atomicProvisionMigration, /insert into public\.customer_portal_access_links/);
  assert.match(atomicProvisionMigration, /to service_role/);
  const createStart = runtime.indexOf("export async function createCustomerPortalAccessLink");
  const createEnd = runtime.indexOf("export async function provisionCustomerPortalAccess", createStart);
  const createSection = runtime.slice(createStart, createEnd);
  assert.doesNotMatch(createSection, /from\("customer_portal_access_links"\)/);
});


test("portal invites auto-deliver only through an existing safe Party-linked conversation", () => {
  assert.match(inviteDelivery, /customer_party_id", partyId/);
  assert.match(inviteDelivery, /status", "OPEN"/);
  assert.match(inviteDelivery, /neq\("provider", "customer_portal"\)/);
  assert.match(inviteDelivery, /neq\("channel_type", "portal"\)/);
  assert.match(inviteDelivery, /allow_messages === false/);
  assert.match(inviteDelivery, /evaluateSecretaryContactQuietHours/);
  assert.match(inviteDelivery, /ACTIVE_PORTAL_SESSION_EXISTS/);
  assert.match(inviteDelivery, /PORTAL_INVITE_ALREADY_MATERIALIZED/);
  assert.match(inviteDelivery, /AVANTIQO_CUSTOMER_PORTAL/);
});

test("communication delivery preserves portal invite lineage across provider state changes", () => {
  assert.match(communicationDelivery, /lineageMetadata/);
  assert.match(communicationDelivery, /source_context/);
  assert.match(communicationDelivery, /AVANTIQO_CUSTOMER_PORTAL/);
});

test("commercial lifecycle requests automatic invite delivery only when a safe conversation exists", () => {
  assert.match(quotationService, /deliverIfConversationAvailable: true/);
  assert.match(salesOrderConfirm, /deliverIfConversationAvailable: true/);
  assert.match(invoiceCreate, /deliverIfConversationAvailable: true/);
  assert.match(hotelBookingCreate, /deliverIfConversationAvailable: true/);
});


test("automatic invite replay preserves an existing live link instead of rotating it", () => {
  assert.match(runtime, /inspectCustomerPortalInviteState/);
  assert.match(runtime, /EXISTING_LIVE_PORTAL_INVITE_PRESERVED/);
  assert.match(runtime, /customer_portal_access_links/);
  assert.match(runtime, /ignoreExistingMessage = true/);
  assert.match(inviteDelivery, /ignoreExistingMessage/);
});


test("customer booking changes are governed requests rather than direct booking mutations", () => {
  assert.match(bookingRequest, /resolveCustomerPortalSession/);
  assert.match(bookingRequest, /isCustomerPortalSameOriginRequest/);
  assert.match(bookingRequest, /customer_party_id", partyId/);
  assert.match(bookingRequest, /Booking not found in customer portal scope/);
  assert.match(bookingRequest, /CUSTOMER_BOOKING_REQUEST/);
  assert.match(bookingRequest, /requested_action: action/);
  assert.doesNotMatch(bookingRequest, /from\("hotel_bookings"\)\s*\.update/);
  assert.doesNotMatch(bookingRequest, /from\("service_plan_occurrences"\)\s*\.update/);
});

test("customer portal messages and booking requests share one canonical portal conversation runtime", () => {
  assert.match(portalCommunication, /communication_conversations/);
  assert.match(portalCommunication, /provider: "customer_portal"/);
  assert.match(portalCommunication, /direction: "INBOUND"/);
  assert.match(portalCommunication, /unread_count/);
  assert.match(messages, /createCustomerPortalInboundMessage/);
  assert.match(bookingRequest, /createCustomerPortalInboundMessage/);
});


test("portal inbound messages enter Secretary reception with canonical Party identity already proven", () => {
  assert.match(portalCommunication, /secretary_message_reception_requests/);
  assert.match(portalCommunication, /contact_party_id: partyId/);
  assert.match(portalCommunication, /canonical_party_preverified: true/);
  assert.match(portalCommunication, /AUTHENTICATED_CUSTOMER_PORTAL/);
  assert.match(portalCommunication, /status: "PENDING"/);
  assert.match(portalCommunication, /secretary_reception_queued/);
});


test("portal invite raw one-time URL is transient and never stored in communication history", () => {
  assert.match(inviteDelivery, /body: historyBody/);
  assert.match(inviteDelivery, /transientBody: transientDeliveryBody/);
  assert.match(inviteDelivery, /sensitiveBody: true/);
  assert.match(inviteDelivery, /one-time access URL is intentionally not stored in message history/);
  assert.doesNotMatch(inviteDelivery, /body:\s*transientDeliveryBody/);
  assert.match(communicationDelivery, /const deliveryBody = transientBody == null/);
  assert.match(communicationDelivery, /provider_error_message: sensitiveBody \? null/);
  assert.match(communicationDelivery, /sensitive_body_transient/);
  assert.match(communicationDelivery, /COMMUNICATION_TRANSIENT_BODY_NOT_AUTHORIZED/);
  assert.match(communicationDelivery, /messageSource === "AVANTIQO_CUSTOMER_PORTAL"/);
});


test("auto-delivered lifecycle responses do not expose the raw one-time portal URL", () => {
  for (const source of [quotationService, salesOrderConfirm, invoiceCreate, hotelBookingCreate]) {
    assert.match(source, /access_link_id: portalProvisioning\.access\.access_link_id/);
    assert.match(source, /expires_at: portalProvisioning\.access\.expires_at/);
    assert.doesNotMatch(source, /portal_access:\s*portalProvisioning\?\.access\s*\|\|\s*null/);
    assert.doesNotMatch(source, /portal_access:\s*portalProvisioning\.access,/);
  }
});


test("staff-created service plans provision the same Party customer portal lifecycle", () => {
  assert.match(servicePlansRoute, /createServicePlan/);
  assert.match(servicePlansRoute, /provisionCustomerPortalAccess/);
  assert.match(servicePlansRoute, /partyId: row\.customer_party_id/);
  assert.match(servicePlansRoute, /sourceType: "SERVICE_PLAN"/);
  assert.match(servicePlansRoute, /deliverIfConversationAvailable: true/);
  assert.match(servicePlansRoute, /access_link_id: portalProvisioning\.access\.access_link_id/);
  assert.doesNotMatch(servicePlansRoute, /portal_access:\s*portalProvisioning\?\.access\s*\|\|\s*null/);
});


test("booking request lifecycle projects Secretary outcome and response back to the customer", () => {
  assert.match(runtime, /decision,action_result,response_message_id/);
  assert.match(runtime, /customerState = "CANCELLED"/);
  assert.match(runtime, /customerState = "CHANGED"/);
  assert.match(runtime, /customerState = "AWAITING_FOLLOW_UP"/);
  assert.match(runtime, /response_text: text\(responseMessage\?\.body \|\| decision\?\.response_text/);
});


test("verified Secretary conversation can securely reissue portal access", () => {
  assert.match(runtime, /resolveLatestCustomerPortalRelationshipSource/);
  assert.match(runtime, /CUSTOMER_PORTAL_ACTIVE_RELATIONSHIP_REQUIRED/);
  assert.match(runtime, /reissueCustomerPortalAccess/);
  assert.match(secretaryMessages, /SEND_PORTAL_LINK/);
  assert.match(secretaryMessages, /reissueCustomerPortalAccess/);
  assert.match(secretaryMessages, /conversationId: contextRows\.request\.conversation_id/);
  assert.match(secretaryMessages, /portal_access_sent: true/);
  assert.match(secretaryMessages, /Never include the raw portal URL in response_text/);
});
