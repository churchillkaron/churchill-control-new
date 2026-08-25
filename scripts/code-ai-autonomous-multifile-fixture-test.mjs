import assert from "node:assert/strict";
import { normalizeMoney } from "../tests/fixtures/code-ai-autonomous-multifile/normalize-money.mjs";
import { summarizeInvoice } from "../tests/fixtures/code-ai-autonomous-multifile/invoice-summary.mjs";

assert.equal(normalizeMoney("12.50"), 12.5, "numeric strings must normalize to finite numbers");
assert.equal(normalizeMoney(7), 7, "finite numbers must be preserved");
assert.equal(normalizeMoney("not-a-number"), 0, "invalid money values must normalize to zero");

assert.deepEqual(
  summarizeInvoice([
    { total: "12.50" },
    { total: 7 },
    { total: "not-a-number" },
  ]),
  { total: 19.5, valid_line_count: 2 },
  "invoice summary must use line.total and count only finite numeric totals",
);
assert.deepEqual(summarizeInvoice(null), { total: 0, valid_line_count: 0 });

console.log("AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_FIXTURE=PASS");
