import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const runtime = read("lib/finance/corrections/FinanceCorrectionRuntime.js");
const workspace = read("components/workspace/finance/FinanceCorrectionWorkspace.jsx");
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

test("correction workspace reuses shared landing health and exposes governed source selection", () => {
  assert.match(workspace, /useFinanceLandingRuntime\(\)/);
  assert.match(workspace, /const health = landing\.accountHealth/);
  assert.doesNotMatch(workspace, /new URL\("\/api\/workspace\/finance\/account-health/);
  assert.match(workspace, /documentIds/);
  assert.match(workspace, /toggleDocument/);
  assert.match(workspace, /Governed source evidence/);
  assert.match(workspace, /Correction already open/);
  assert.match(workspace, /Promise\.all\(\[load\(\), landing\.refresh\(\)\]\)/);
});
