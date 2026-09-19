import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js", import.meta.url),
  "utf8",
);

test("experiment receipts reject expired rows as current", () => {
  assert.match(runtime, /function activeAndUnexpired/);
  assert.match(runtime, /if \(!receipt \|\| !activeAndUnexpired\(receipt\)\)/);
  assert.match(runtime, /RECEIPT_RETENTION_DAYS = 730/);
});

test("experiment receipt cleanup is bounded and physically deletes expired rows", () => {
  assert.match(runtime, /purgeExpiredExperimentExecutionReceipts/);
  assert.match(runtime, /\.eq\("memory_scope", RECEIPT_SCOPE\)/);
  assert.match(runtime, /\.eq\("source", "experiment_execution_receipt_provenance"\)/);
  assert.match(runtime, /\.lt\("valid_until", new Date\(\)\.toISOString\(\)\)/);
  assert.match(runtime, /Math\.min\(100, Number\(limit\) \|\| 100\)/);
  assert.match(runtime, /\.delete\(\)/);
  assert.match(runtime, /AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_PURGE_FAILED/);
});
