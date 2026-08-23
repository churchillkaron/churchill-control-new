import assert from "node:assert/strict";
import { sumInvoiceLines } from "../tests/fixtures/code-ai-autonomous-repair/invoice-total.mjs";

assert.equal(sumInvoiceLines(null), 0, "non-arrays must return zero");
assert.equal(sumInvoiceLines([]), 0, "empty arrays must return zero");
assert.equal(
  sumInvoiceLines([
    { total: 10 },
    { total: "12.50" },
    { total: "invalid" },
    { total: null },
    {},
  ]),
  22.5,
  "numeric strings must add numerically and invalid values must be ignored",
);
assert.equal(
  sumInvoiceLines([{ total: 0 }, { total: "0" }, { total: -3.25 }, { total: "4.25" }]),
  1,
  "zero and negative finite values must be preserved",
);

console.log("AVANTIQO_CODE_AUTONOMOUS_REPAIR_FIXTURE=PASS");
