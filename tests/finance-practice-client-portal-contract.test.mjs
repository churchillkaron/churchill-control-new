import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const grantMigration = fs.readFileSync(new URL("../supabase/migrations/20260918093000_accounting_client_portal_grants.sql", import.meta.url), "utf8");
const messageMigration = fs.readFileSync(new URL("../supabase/migrations/20260918103000_accounting_client_portal_messages.sql", import.meta.url), "utf8");
const grant = fs.readFileSync(new URL("../lib/finance/practice/FinanceClientPortalGrant.js", import.meta.url), "utf8");
const projection = fs.readFileSync(new URL("../lib/finance/practice/FinanceClientPortalProjection.js", import.meta.url), "utf8");
const staffRoute = fs.readFileSync(new URL("../app/api/workspace/finance/practice-client-portal/route.js", import.meta.url), "utf8");
const publicRoute = fs.readFileSync(new URL("../app/api/public/finance/client-portal/[token]/route.js", import.meta.url), "utf8");
const documentRoute = fs.readFileSync(new URL("../app/api/public/finance/client-portal/[token]/documents/[documentId]/route.js", import.meta.url), "utf8");
const invoiceRoute = fs.readFileSync(new URL("../app/api/public/finance/client-portal/[token]/invoices/[invoiceId]/route.js", import.meta.url), "utf8");
const publicPage = fs.readFileSync(new URL("../app/client/accounting/[token]/page.jsx", import.meta.url), "utf8");
const staffPage = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeClientPortal.jsx", import.meta.url), "utf8");
const tower = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeControlTower.jsx", import.meta.url), "utf8");

test("client portal grants are expiring revocable engagement-scoped and allow org scope when entity is absent", () => {
  for (const field of ["accounting_firm_id", "organization_id", "entity_id", "engagement_id", "token_hash", "expires_at", "revoked_at"]) assert.match(grantMigration, new RegExp(field));
  assert.match(grant, /randomBytes\(32\)/);
  assert.match(grant, /sha256/);
  assert.match(grant, /Date\.parse\(grant\.expires_at\) <= Date\.now\(\)/);
  assert.match(grant, /scope: entityId \? "ENTITY" : "ORGANIZATION"/);
  assert.match(grant, /general_erp_access: false/);
  assert.doesNotMatch(staffRoute, /Client legal entity must be configured before portal access/);
});

test("public accounting portal can only act inside the exact engagement and real client requests", () => {
  assert.match(publicRoute, /run\.engagement_id !== context\.engagement\.id/);
  assert.match(publicRoute, /item\.work_type !== "CLIENT_REQUEST"/);
  assert.match(publicRoute, /item\.capability_id !== "documents"/);
  assert.match(publicRoute, /accounting_work_program_evidence_links/);
  assert.match(publicRoute, /createControlledDocument/);
  assert.match(publicRoute, /classification: "CONFIDENTIAL"/);
  assert.doesNotMatch(publicRoute, /general_ledger|trial_balance|journal_entries/);
});

test("portal projection is client-safe and never reads internal ledger review or WIP detail", () => {
  for (const safeSource of ["accounting_client_profiles", "accounting_engagement_runs", "accounting_engagement_work_items", "finance_vat_returns", "accounting_practice_billing_batches", "customer_invoices", "customer_payments", "document_signature_requests", "accounting_client_portal_messages"]) assert.match(projection, new RegExp(safeSource));
  assert.doesNotMatch(projection, /general_ledger|journal_entries|trial_balance|accounting_practice_time_entries|reviewer_notes|partner_notes/);
  assert.match(projection, /eq\("engagement_id", engagement\.id\)/);
  assert.match(projection, /eq\("accounting_firm_id", grant\.accounting_firm_id\)/);
});

test("documents and invoices require exact engagement proof before public opening", () => {
  assert.match(documentRoute, /reference_type", "ACCOUNTING_ENGAGEMENT"/);
  assert.match(documentRoute, /reference_id", grant\.engagement_id/);
  assert.match(documentRoute, /accounting_work_program_evidence_links/);
  assert.match(documentRoute, /engagement_id", grant\.engagement_id/);
  assert.match(invoiceRoute, /accounting_practice_billing_batches/);
  assert.match(invoiceRoute, /engagement_id", grant\.engagement_id/);
  assert.match(invoiceRoute, /invoice_id", invoiceId/);
  assert.match(invoiceRoute, /renderCustomerInvoicePdf/);
});

test("portal message channel is durable service-role-only and two-way", () => {
  for (const field of ["accounting_firm_id", "organization_id", "engagement_id", "portal_grant_id", "sender_type", "body", "read_by_client_at", "read_by_firm_at"]) assert.match(messageMigration, new RegExp(field));
  assert.match(messageMigration, /enable row level security/);
  assert.match(messageMigration, /revoke all on table public\.accounting_client_portal_messages from anon, authenticated/);
  assert.match(publicRoute, /action === "message"/);
  assert.match(publicRoute, /sender_type: "CLIENT"/);
  assert.match(staffRoute, /action === "message"/);
  assert.match(staffRoute, /sender_type: "ACCOUNTING_FIRM"/);
  assert.match(staffPage, /Client conversation/);
});

test("practice issues portal identity explicitly and returns raw token once", () => {
  assert.match(staffRoute, /Client email is required; Avantiqo will not guess portal identity/);
  assert.match(staffRoute, /token_returned_once: true/);
  assert.match(staffRoute, /client_path: `\/client\/accounting\//);
  assert.match(tower, /id: "portal", label: "Client access"/);
});

test("client portal is a complete client workspace rather than an ERP copy", () => {
  for (const label of ["Home", "Requests", "Documents", "Messages", "Tax & filings", "Invoices & payments", "Approvals", "Contacts"]) assert.match(publicPage, new RegExp(label.replace(/[&]/g, "&")));
  assert.match(publicPage, /does not provide access to your general ledger, journals, internal review notes/);
  assert.match(publicPage, /secure workspace/);
  assert.match(publicPage, /Your company details/);
  assert.match(publicPage, /Your accounting team/);
});
