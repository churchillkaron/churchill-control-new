import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const runtime = read("lib/finance/corrections/FinanceCorrectionRuntime.js");
const workspace = read("components/workspace/finance/FinanceCorrectionWorkspace.jsx");
const migration = read("supabase/migrations/20260903135500_finance_open_accounting_correction_uniqueness.sql");

test("correction lifecycle revalidates the source exception before every controlled progression", () => {
  assert.match(runtime, /assertExceptionStillOpen\(\{ accountingFirmId, current, stage: "submission" \}\)/);
  assert.match(runtime, /assertExceptionStillOpen\(\{ accountingFirmId, current, stage: "approval" \}\)/);
  assert.match(runtime, /assertExceptionStillOpen\(\{ accountingFirmId, current, stage: "posting" \}\)/);
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

test("correction workspace reuses shared landing account health", () => {
  assert.match(workspace, /useFinanceLandingRuntime\(\)/);
  assert.match(workspace, /const health = landing\.accountHealth/);
  assert.doesNotMatch(workspace, /new URL\("\/api\/workspace\/finance\/account-health/);
  assert.match(workspace, /Correction already open/);
  assert.match(workspace, /Promise\.all\(\[load\(\), landing\.refresh\(\)\]\)/);
});
