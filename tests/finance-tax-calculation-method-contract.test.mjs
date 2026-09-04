import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const submit = read("app/api/finance/vat-returns/mark-submitted/route.js");
const migration = read("supabase/migrations/20260904124500_vat_calculation_excludes_reversed_postings.sql");

test("VAT filing rejects calculations produced by an older evidence method", () => {
  assert.match(submit, /REQUIRED_VAT_CALCULATION_METHOD = "POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2"/);
  assert.match(submit, /preflight\?\.return\?\.calculation\?\.method/);
  assert.match(submit, /storedMethod !== REQUIRED_VAT_CALCULATION_METHOD/);
  assert.match(submit, /Recalculate from governed line evidence before filing/);
  assert.match(submit, /requireCurrentCalculationMethod\(preflight\)/);
});

test("VAT database calculation excludes reversed sales posting evidence", () => {
  assert.match(migration, /customer_invoice_lines/);
  assert.match(migration, /POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2/);
  assert.match(migration, /coalesce\(je\.reversed,false\) is not true/);
});
