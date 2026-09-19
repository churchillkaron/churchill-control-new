import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918170000_finance_auditor_package.sql");
const runtime = read("lib/finance/auditor/FinanceAuditorPackageRuntime.js");
const api = read("app/api/finance/auditor-package/route.js");
const publicApi = read("app/api/public/finance/auditor-package/[token]/route.js");
const publicDownload = read("app/api/public/finance/auditor-package/[token]/download/route.js");
const panel = read("components/workspace/finance/FinanceAuditorPackagePanel.jsx");
const room = read("app/auditor/package/[token]/page.jsx");
const reportingPage = read("app/(system)/workspace/[organizationId]/finance/reporting/page.jsx");

test("auditor package persistence is immutable-snapshot metadata with exact-package grants", () => {
  assert.match(migration, /create table if not exists public\.finance_auditor_packages/);
  assert.match(migration, /close_run_id uuid not null references public\.finance_period_close_runs/);
  assert.match(migration, /close_fingerprint_digest text not null/);
  assert.match(migration, /package_digest text not null/);
  assert.match(migration, /controlled_document_id uuid not null references public\.enterprise_documents/);
  assert.match(migration, /unique \(organization_id, entity_id, period_id, package_version\)/);
  assert.match(migration, /create table if not exists public\.finance_auditor_package_grants/);
  assert.match(migration, /package_id uuid not null references public\.finance_auditor_packages/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /download_count integer not null default 0/);
  assert.match(migration, /revoke all on table public\.finance_auditor_packages from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.finance_auditor_package_grants from anon, authenticated/);
});

test("generation fails closed until a governed close exists and remains CURRENT", () => {
  assert.match(runtime, /\.eq\("status", "COMPLETED"\)/);
  assert.match(runtime, /\["CLOSED", "LOCKED"\]/);
  assert.match(runtime, /buildFinanceClosePackageSnapshot/);
  assert.match(runtime, /evaluateFinanceClosePackageFreshness/);
  assert.match(runtime, /freshness\.state !== "CURRENT"/);
  assert.match(runtime, /AUDITOR_PACKAGE_NOT_READY/);
  assert.doesNotMatch(runtime, /override.*close|force.*package/i);
});

test("auditor statements reuse canonical report authorities and require a balanced trial balance", () => {
  assert.match(runtime, /runReport\("trial_balance"/);
  assert.match(runtime, /runReport\("profit_loss"/);
  assert.match(runtime, /runReport\("balance_sheet"/);
  assert.match(runtime, /runReport\("cash_flow"/);
  assert.match(runtime, /trialBalance\?\.balanced !== true/);
  assert.match(runtime, /Trial balance must be balanced before auditor package generation/);
});

test("package source uses complete Finance populations and exact period evidence", () => {
  assert.match(runtime, /fetchCompleteFinancePopulation/);
  assert.match(runtime, /Auditor package work-program evidence/);
  assert.match(runtime, /Auditor package vendor invoice evidence/);
  assert.match(runtime, /Auditor package AP intake evidence/);
  assert.match(runtime, /Auditor package bank statement imports/);
  assert.match(runtime, /financial_periods/);
  assert.match(runtime, /\.eq\("start_date", start\)\.eq\("end_date", end\)/);
  assert.match(runtime, /source_organization_document_id/);
});

test("auditor ZIP contains accounting populations controls reports and real supporting evidence", () => {
  for (const expected of [
    "ledger/general-ledger.csv",
    "ledger/journals.csv",
    "reports/trial-balance.csv",
    "reports/profit-and-loss.json",
    "reports/balance-sheet.json",
    "reports/cash-flow.json",
    "controls/bank-reconciliations.json",
    "controls/tax-and-statutory.json",
    "controls/review-and-approval.json",
    "evidence/supporting-document-index.json",
  ]) assert.ok(runtime.includes(expected), expected);
  assert.match(runtime, /supabaseAdmin\.storage\.from\("documents"\)\.download/);
  assert.match(runtime, /Supporting document checksum mismatch/);
  assert.match(runtime, /addBankStatementSourceFiles/);
  assert.match(runtime, /Unable to freeze bank statement source/);
});

test("package digest binds full evidence records and actual frozen file checksums", () => {
  assert.match(runtime, /supporting_evidence_digest: digest\(\{/);
  assert.match(runtime, /work_program_evidence: supporting\.work_program_evidence/);
  assert.match(runtime, /vendor_invoice_evidence: supporting\.vendor_invoice_evidence/);
  assert.match(runtime, /bank_statement_imports: supporting\.bank_statement_imports/);
  assert.match(runtime, /frozen_file_digest: digest\(frozenEvidence\)/);
  assert.match(runtime, /checksum_sha256: row\.checksum_sha256/);
  assert.match(runtime, /const packageDigest = digest\(finalSourceCore\)/);
});

test("frozen package is a restricted controlled ZIP and never creates accounting authority", () => {
  assert.match(runtime, /documentType: "FINANCE_AUDITOR_PACKAGE"/);
  assert.match(runtime, /classification: "RESTRICTED"/);
  assert.match(runtime, /application\/zip/);
  assert.match(runtime, /immutable_snapshot: true/);
  assert.match(runtime, /mutation_authority: false/);
  assert.doesNotMatch(runtime, /finance_post_journal|journal_entries.*insert|general_ledger.*insert/);
});

test("auditor grants are expiring revocable read-only and exact-package only", () => {
  assert.match(runtime, /crypto\.randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(runtime, /token_hash: tokenHash/);
  assert.match(runtime, /Math\.max\(1, Math\.min\(Number\(ttlDays\) \|\| 30, 90\)\)/);
  assert.match(runtime, /read_only: true/);
  assert.match(runtime, /exact_package_only: true/);
  assert.match(runtime, /erp_access: false/);
  assert.match(runtime, /mutation_authority: false/);
  assert.match(runtime, /Auditor package is stale; generate a current package before sharing it/);
  assert.match(runtime, /is\("revoked_at", null\)\.gt\("expires_at", now\(\)\)/);
});

test("internal API separates view/download from package generation and sharing authority", () => {
  assert.match(api, /finance\.reports\.view/);
  assert.match(api, /finance\.reports\.manage/);
  assert.match(api, /finance\.close\.execute/);
  assert.match(api, /action === "download"/);
  assert.match(api, /action === "generate"/);
  assert.match(api, /action === "grant"/);
  assert.match(api, /action === "revoke_grant"/);
});

test("public auditor room reveals one frozen package and only a short-lived download", () => {
  assert.match(publicApi, /resolvePublicFinanceAuditorPackageGrant/);
  assert.match(publicApi, /read_only: true/);
  assert.match(publicApi, /mutation_authority: false/);
  assert.match(publicDownload, /getPublicFinanceAuditorPackageDownload/);
  assert.match(publicDownload, /NextResponse\.redirect/);
  assert.match(room, /Read-only · exact package only · no ERP access/);
  assert.match(room, /Download frozen auditor ZIP/);
});

test("Finance Reports presents auditor readiness before generation and explicit share controls", () => {
  assert.match(reportingPage, /FinanceAuditorPackagePanel/);
  assert.match(panel, /Auditor package/);
  assert.match(panel, /Not ready to package/);
  assert.match(panel, /Generate frozen package/);
  assert.match(panel, /disabled=\{!readiness\?\.ready/);
  assert.match(panel, /Issue read-only link/);
  assert.match(panel, /Copy auditor link/);
  assert.match(panel, /Revoke/);
});
