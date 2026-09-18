import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const migration = fs.readFileSync(new URL("../supabase/migrations/20260918093000_accounting_client_portal_grants.sql", import.meta.url), "utf8");
const grant = fs.readFileSync(new URL("../lib/finance/practice/FinanceClientPortalGrant.js", import.meta.url), "utf8");
const staffRoute = fs.readFileSync(new URL("../app/api/workspace/finance/practice-client-portal/route.js", import.meta.url), "utf8");
const publicRoute = fs.readFileSync(new URL("../app/api/public/finance/client-portal/[token]/route.js", import.meta.url), "utf8");
const publicPage = fs.readFileSync(new URL("../app/client/accounting/[token]/page.jsx", import.meta.url), "utf8");
const tower = fs.readFileSync(new URL("../components/workspace/finance/FinancePracticeControlTower.jsx", import.meta.url), "utf8");

test("client portal grants are expiring revocable and engagement scoped", () => {
  for (const field of ["accounting_firm_id", "organization_id", "entity_id", "engagement_id", "token_hash", "expires_at", "revoked_at"]) assert.match(migration, new RegExp(field));
  assert.match(grant, /randomBytes\(32\)/); assert.match(grant, /sha256/); assert.match(grant, /Date\.parse\(grant\.expires_at\) <= Date\.now\(\)/); assert.match(grant, /general_erp_access: false/);
});

test("public accounting portal can only act inside the exact engagement and real client requests", () => {
  assert.match(publicRoute, /run\.engagement_id !== context\.engagement\.id/);
  assert.match(publicRoute, /item\.work_type !== "CLIENT_REQUEST"/);
  assert.match(publicRoute, /item\.capability_id !== "documents"/);
  assert.match(publicRoute, /accounting_work_program_evidence_links/);
  assert.match(publicRoute, /createControlledDocument/);
  assert.match(publicRoute, /classification: "CONFIDENTIAL"/);
  assert.doesNotMatch(publicRoute, /general_ledger|trial_balance|finance_customer_invoices/);
});

test("practice issues portal identity explicitly and returns the raw token once", () => {
  assert.match(staffRoute, /Client email is required; Avantiqo will not guess portal identity/);
  assert.match(staffRoute, /token_returned_once: true/);
  assert.match(staffRoute, /client_path: `\/client\/accounting\//);
  assert.match(tower, /id: "portal", label: "Client access"/);
});

test("client portal is human and request focused", () => {
  assert.match(publicPage, /Requests from your accounting team/);
  assert.match(publicPage, /does not give access to the company’s full accounting system/);
  assert.match(publicPage, /Upload/);
  assert.match(publicPage, /Submit/);
});
