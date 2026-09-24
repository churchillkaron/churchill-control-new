import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("customer portal access links and sessions persist hashes only", () => {
  const runtime = read("lib/customer-portal/CustomerPortalRuntime.js");
  const accessApi = read("app/api/customer-portal/access/[token]/route.js");
  const linkApi = read("app/api/customer-portal/access-links/route.js");

  assert.match(runtime, /createHash\("sha256"\)/);
  assert.match(runtime, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(linkApi, /token_hash: tokenHash/);
  assert.match(runtime, /session_token_hash: sessionTokenHash/);
  assert.doesNotMatch(runtime, /session_token:/);
  assert.doesNotMatch(linkApi, /token:/);
  assert.match(accessApi, /httpOnly: true/);
  assert.match(accessApi, /sameSite: "lax"/);
  assert.match(accessApi, /secure: process\.env\.NODE_ENV === "production"/);
});

test("customer access link is expiring revoked aware and one-time", () => {
  const runtime = read("lib/customer-portal/CustomerPortalRuntime.js");
  const migration = read("supabase/migrations/20260923010028_customer_portal_atomic_token_consumption.sql");
  const linkApi = read("app/api/customer-portal/access-links/route.js");

  assert.match(runtime, /outcome === "REVOKED"/);
  assert.match(runtime, /outcome === "EXPIRED"/);
  assert.match(runtime, /outcome === "USED"/);
  assert.match(migration, /v_link\.revoked_at is not null/);
  assert.match(migration, /v_link\.consumed_at is not null/);
  assert.match(migration, /v_link\.expires_at <= v_now/);
  assert.match(migration, /for update/);
  assert.match(linkApi, /expiresHours = Math\.min\(168, Math\.max\(1,/);
  assert.match(linkApi, /\.eq\("party_id", party\.id\)/);
  assert.match(linkApi, /\.is\("consumed_at", null\)/);
  assert.match(linkApi, /\.is\("revoked_at", null\)/);
});

test("customer portal session is revocable expiring and party scoped", () => {
  const runtime = read("lib/customer-portal/CustomerPortalRuntime.js");

  assert.match(runtime, /CUSTOMER_PORTAL_SESSION_DAYS = 30/);
  assert.match(runtime, /session\.revoked_at/);
  assert.match(runtime, /new Date\(session\.expires_at\)\.getTime\(\) <= now\.getTime\(\)/);
  assert.match(runtime, /organizationId = text\(session\?\.organization_id\)/);
  assert.match(runtime, /partyId = text\(session\?\.party_id\)/);

  for (const table of ["customer_invoices","customer_payments","sales_orders","customer_portal_payment_requests"]) {
    const block = runtime.split(`from("${table}")`)[1] || "";
    assert.match(block, /\.eq\("organization_id", organizationId\)/);
    assert.match(block, /\.eq\("party_id", partyId\)/);
  }
});

test("hotel bookings are exposed only through a hotel guest linked to the same customer Party", () => {
  const runtime = read("lib/customer-portal/CustomerPortalRuntime.js");
  assert.match(runtime, /from\("hotel_guests"\)/);
  assert.match(runtime, /\.eq\("organization_id", organizationId\)\.eq\("party_id", partyId\)/);
  assert.match(runtime, /const guestIds = \(guestResult\.data \|\| \[\]\)\.map/);
  assert.match(runtime, /from\("hotel_bookings"\)/);
  assert.match(runtime, /\.eq\("organization_id", organizationId\)\.in\("guest_id", guestIds\)/);
});

test("customer portal never grants internal organization or staff membership", () => {
  const runtime = read("lib/customer-portal/CustomerPortalRuntime.js");
  const accessApi = read("app/api/customer-portal/access/[token]/route.js");
  const linkApi = read("app/api/customer-portal/access-links/route.js");

  for (const source of [runtime, accessApi, linkApi]) {
    assert.doesNotMatch(source, /organization_users/);
    assert.doesNotMatch(source, /staff_accounts/);
    assert.doesNotMatch(source, /supplier_portal_account_members/);
  }
});

test("business creates customer portal access from the canonical customer Party under organization authority", () => {
  const linkApi = read("app/api/customer-portal/access-links/route.js");
  const customerUi = read("components/workspace/commercial/CustomerRuntimeWorkCenter.jsx");

  assert.match(linkApi, /requireOrganizationAccess/);
  assert.match(linkApi, /from\("parties"\)/);
  assert.match(linkApi, /\.eq\("organization_id", access\.organizationId\)/);
  assert.match(linkApi, /\.eq\("id", partyId\)/);
  assert.match(linkApi, /token_hash: tokenHash/);
  assert.match(linkApi, /access_url:/);
  assert.match(customerUi, /Customer Portal/);
  assert.match(customerUi, /createCustomerPortalLink/);
  assert.match(customerUi, /Secure Customer Portal link · 72 hours · one-time use/);
  assert.match(customerUi, /setPortalLink\(""\)/);
});

test("customer portal has role-specific routes and secure-link gate", () => {
  const shell = read("components/customer-portal/CustomerPortalShell.jsx");
  const workspace = read("components/customer-portal/CustomerPortalWorkspace.jsx");
  const accessPage = read("app/customer-access/[token]/page.jsx");

  for (const route of ["orders","invoices","payments","bookings","profile"]) {
    assert.match(shell, new RegExp("/customer-portal/" + route));
    assert.ok(fs.existsSync("app/customer-portal/" + route + "/page.jsx"));
  }
  assert.match(workspace, /Open the secure link sent by the business/);
  assert.match(workspace, /does not create staff access or an internal Avantiqo workspace/);
  assert.match(accessPage, /one-time token can only be used once|original access token can only be used once/i);
});

test("customer portal context API derives scope only from the private session cookie", () => {
  const route = read("app/api/customer-portal/context/route.js");
  assert.match(route, /request\.cookies\.get\(CUSTOMER_PORTAL_COOKIE\)/);
  assert.match(route, /resolveCustomerPortalSession/);
  assert.match(route, /customerPortalSnapshot\(resolved\.session\)/);
  assert.doesNotMatch(route, /searchParams\.get\("organization/);
  assert.doesNotMatch(route, /searchParams\.get\("party/);
});

test("customer portal card checkout is session scoped and uses the organization connected merchant account", () => {
  const checkout = read("app/api/customer-portal/payments/checkout/route.js");
  const settlement = read("lib/customer-portal/CustomerPortalPaymentSettlementRuntime.js");

  assert.match(checkout, /request\.cookies\.get\(CUSTOMER_PORTAL_COOKIE\)/);
  assert.match(checkout, /resolveCustomerPortalSession/);
  assert.match(checkout, /\.eq\("organization_id", portalSession\.organization_id\)/);
  assert.match(checkout, /\.eq\("party_id", portalSession\.party_id\)/);
  assert.match(checkout, /organization_payment_provider_accounts/);
  assert.match(checkout, /\.eq\("purpose", "merchant_payments"\)/);
  assert.match(checkout, /connectedAccountId: merchant\.provider_account_id/);
  assert.match(checkout, /domain: "customer_portal"/);
  assert.match(checkout, /portalPaymentRequestId: paymentRequest\.id/);
  assert.match(checkout, /merchant_account_scope: "organization_connected_account"/);
  assert.match(settlement, /customer_portal_payment_requests/);
});

test("customer portal checkout refuses stale invoice scope and requires an explicit Finance settlement account", () => {
  const checkout = read("app/api/customer-portal/payments/checkout/route.js");
  assert.match(checkout, /if \(!paymentRequest\.bank_account_id\)/);
  assert.match(checkout, /Customer payment request has no Finance settlement bank account/);
  assert.match(checkout, /source_type === "CUSTOMER_INVOICE"/);
  assert.match(checkout, /String\(invoice\.party_id\) !== String\(paymentRequest\.party_id\)/);
  assert.match(checkout, /String\(invoice\.entity_id \|\| ""\) !== String\(paymentRequest\.entity_id \|\| ""\)/);
  assert.match(checkout, /Customer invoice balance changed/);
  assert.match(checkout, /Customer invoice currency no longer matches/);
});

test("customer portal checkout reissue cannot reuse a stale Stripe amount", () => {
  const finance = read("app/api/finance/customer-portal-payment-requests/route.js");
  const checkout = read("app/api/customer-portal/payments/checkout/route.js");
  assert.match(finance, /checkout_version: Number\(existing\?\.metadata\?\.checkout_version \|\| 0\) \+ 1/);
  assert.match(finance, /provider_session_id: null/);
  assert.match(finance, /provider_payment_id: null/);
  assert.match(finance, /provider_event_id: null/);
  assert.match(checkout, /customer-portal-checkout:\$\{paymentRequest\.id\}:v\$\{Number\(paymentRequest\.metadata\?\.checkout_version \|\| 1\)\}/);
});

test("Finance issues customer portal invoice payment requests under receivables authority", () => {
  const route = read("app/api/finance/customer-portal-payment-requests/route.js");
  const workcenter = read("components/workspace/finance/FinanceAccountantRecordsWorkCenter.jsx");

  assert.match(route, /permissionKey: "finance\.receivables\.manage"/);
  assert.match(route, /from\("customer_invoices"\)/);
  assert.match(route, /from\("bank_accounts"\)/);
  assert.match(route, /\.eq\("entity_id", invoice\.entity_id\)/);
  assert.match(route, /finance_account_id/);
  assert.match(route, /organization_payment_provider_accounts/);
  assert.match(route, /purpose", "merchant_payments"/);
  assert.match(route, /provider_connection_id/);
  assert.match(route, /source_type: "CUSTOMER_INVOICE"/);
  assert.match(route, /status: "PENDING"/);
  assert.match(workcenter, /Customer Portal Payment/);
  assert.match(workcenter, /Settlement bank account/);
  assert.match(workcenter, /Issue payment request/);
  assert.match(workcenter, /Customer card details never enter Avantiqo/);
});

test("customer portal payment UI never collects card credentials", () => {
  const ui = read("components/customer-portal/CustomerPortalWorkspace.jsx");
  assert.match(ui, /Pay securely/);
  assert.match(ui, /Pay by card/);
  assert.match(ui, /window\.location\.assign\(payload\.checkout_url\)/);
  assert.doesNotMatch(ui, /card_number|cardNumber|cvc|cvv|expiry/i);
});

test("public product and start surfaces describe the live secure Customer Portal accurately", () => {
  const catalog = read("components/public/productCatalog.js");
  const products = read("components/public/ProductsCatalogPage.jsx");
  const start = read("app/start/page.jsx");

  assert.match(catalog, /id:"customer-portal"[^\n]*status:"foundation"[^\n]*href:"\/customer-portal"/);
  assert.match(catalog, /id:"customer-self-service"[^\n]*orders, invoices, payment requests, payment history and linked hospitality bookings[^\n]*status:"foundation"/);
  assert.match(products, /"Customer"[^\n]*"Orders · invoices · payments · bookings"[^\n]*"\/customer-portal"/);
  assert.match(start, /Customer \/ guest/);
  assert.match(start, /secure one-time Customer Portal link sent by the business/);
  assert.match(start, /Customer access never creates staff membership or an internal workspace/);
});

test("customer access token consumption and session creation are atomic", () => {
  const runtime = read("lib/customer-portal/CustomerPortalRuntime.js");
  const migration = read("supabase/migrations/20260923010028_customer_portal_atomic_token_consumption.sql");

  assert.match(runtime, /consume_customer_portal_access_token_atomic/);
  assert.doesNotMatch(runtime, /customer_portal_sessions"\)\.insert/);
  assert.doesNotMatch(runtime, /customer_portal_sessions"\)\.delete/);
  assert.match(migration, /update public\.customer_portal_access_links[\s\S]*consumed_at = v_now/);
  assert.match(migration, /insert into public\.customer_portal_sessions/);
  assert.match(migration, /CUSTOMER_PORTAL_LINK_CONSUME_CONFLICT/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.match(migration, /p_session_expires_at > v_now \+ interval '31 days'/);
});

test("customer portal fails closed with an explicit service error when atomic migration is missing", () => {
  const runtime = read("lib/customer-portal/CustomerPortalRuntime.js");
  const route = read("app/api/customer-portal/access/[token]/route.js");
  assert.match(runtime, /CUSTOMER_PORTAL_MIGRATION_REQUIRED/);
  assert.match(runtime, /migrationError\.status = 503/);
  assert.match(runtime, /PGRST202/);
  assert.match(route, /code: error\?\.code \|\| null/);
  assert.match(route, /status: Number\(error\?\.status\) \|\| 500/);
});
