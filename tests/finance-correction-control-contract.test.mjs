import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const runtime = read("lib/finance/corrections/FinanceCorrectionRuntime.js");
const workspace = read("components/workspace/finance/FinanceCorrectionWorkspace.jsx");
const route = read("app/api/workspace/finance/corrections/route.js");
const migration = read("supabase/migrations/20260903135500_finance_open_accounting_correction_uniqueness.sql");

test("correction lifecycle revalidates the source exception before every controlled progression", () => {
  assert.match(runtime, /stage:\s*"submission"/);
  assert.match(runtime, /stage:\s*"approval"/);
  assert.match(runtime, /stage:\s*"posting"/);
  assert.match(runtime, /status:\s*"RESOLVED"/);
  assert.match(runtime, /source_exception_cleared:\s*true/);
});

test("duplicate active correction cases are blocked in runtime and database", () => {
  assert.match(runtime, /findOpenDuplicate/);
  assert.match(runtime, /error\?\.code === "23505"/);
  assert.match(migration, /create unique index if not exists finance_approval_requests_open_accounting_correction_uniq/i);
  assert.match(migration, /upper\(status\) in \('DRAFT','REJECTED','PENDING','APPROVED'\)/);
  assert.match(migration, /metadata->'exception'->>'account_id'/);
});

test("correction evidence is governed at submit, approval and posting without blocking incomplete drafts", () => {
  assert.match(runtime, /getFinanceEvidenceDocument/);
  assert.match(runtime, /async function validateEvidence/);
  assert.match(runtime, /requireBasis:\s*submit/);
  assert.match(runtime, /requireDocument:\s*submit && mode === "JOURNAL"/);
  assert.match(runtime, /if \(approve\) \{[\s\S]*assertEvidenceReady\(current\)/);
  assert.match(runtime, /stage:\s*"posting"[\s\S]*assertEvidenceReady\(current\)/);
  assert.match(runtime, /approval_required === true && !document\.approved_at/);
  assert.match(runtime, /checksum_sha256/);
});

test("evidence validation is persisted at submission, approval and before the financial side effect", () => {
  assert.match(runtime, /function withEvidenceBoundary/);
  assert.match(runtime, /boundary_validations/);
  assert.match(runtime, /stage:\s*"submission"[\s\S]*phase:\s*"PRE_SUBMISSION"/);
  assert.match(runtime, /stage:\s*"approval"[\s\S]*phase:\s*"PRE_APPROVAL_DECISION"/);
  assert.match(runtime, /stage:\s*"posting"[\s\S]*phase:\s*"PRE_FINANCIAL_SIDE_EFFECT"/);
  assert.match(runtime, /const \{ data: postingReady, error: preflightError \} = await supabaseAdmin[\s\S]*\.eq\("status", "APPROVED"\)/);
  const preflightIndex = runtime.indexOf('phase: "PRE_FINANCIAL_SIDE_EFFECT"');
  const postIndex = runtime.indexOf("await postJournalEntrySafe");
  assert.ok(preflightIndex >= 0 && postIndex > preflightIndex, "posting evidence must be persisted before journal execution");
});

test("correction workspace reuses shared landing health and exposes complete searchable governed evidence", () => {
  assert.match(workspace, /useFinanceLandingRuntime\(\)/);
  assert.match(workspace, /const health = landing\.accountHealth/);
  assert.doesNotMatch(workspace, /new URL\("\/api\/workspace\/finance\/account-health/);
  assert.match(workspace, /documentIds/);
  assert.match(workspace, /toggleDocument/);
  assert.match(workspace, /Governed source evidence/);
  assert.match(workspace, /evidenceQuery/);
  assert.match(workspace, /evidenceDocuments\.map/);
  assert.doesNotMatch(workspace, /state\.documents\.slice\(0,\s*20\)/);
  assert.match(workspace, /boundary_validations/);
  assert.match(workspace, /Correction already open/);
  assert.match(workspace, /Promise\.all\(\[load\(\), landing\.refresh\(\)\]\)/);
  assert.match(route, /listFinanceEvidenceDocuments\(\{ organizationId: clientOrg, entityId: entityId \|\| null, limit: 500 \}\)/);
});
