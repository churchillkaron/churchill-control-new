import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const runtime = read("lib/finance/tax/FinanceTaxEvidenceDrilldownRuntime.js");
const rail = read("components/workspace/finance/FinanceTaxEvidenceDrilldownRail.jsx");
const route = read("app/api/finance/vat-returns/evidence-drilldown/route.js");

test("VAT coding evidence carries exact source document, line and governed rule context for both sides", () => {
  assert.match(runtime, /dependencyCode === "OUTPUT_CODING"/);
  assert.match(runtime, /dependencyCode === "INPUT_CODING"/);
  for (const marker of [
    "OUTPUT_TAX_CODE_MISSING",
    "OUTPUT_TAX_CODE_UNRESOLVED",
    "OUTPUT_VAT_RULE_NOT_EFFECTIVE",
    "INPUT_TAX_CODE_MISSING",
    "INPUT_TAX_CODE_UNRESOLVED",
    "INPUT_VAT_RULE_NOT_EFFECTIVE",
  ]) assert.match(runtime, new RegExp(marker));
  assert.match(runtime, /source: sourceRecord\(invoice, "CUSTOMER_INVOICE"\)/);
  assert.match(runtime, /source: sourceRecord\(invoice, "VENDOR_INVOICE"\)/);
  assert.match(runtime, /line: lineRecord\(line, "OUTPUT"\)/);
  assert.match(runtime, /line: lineRecord\(line, "INPUT"\)/);
  assert.match(runtime, /rule: ruleRecord\(rule\)/);
  assert.match(runtime, /description: text\(line\.description \|\| line\.memo \|\| line\.name\)/);
  assert.match(runtime, /tax_amount: line\.tax_amount == null \? null : Number\(line\.tax_amount\)/);
  assert.match(runtime, /tax_rule_id: side === "OUTPUT" \? line\.tax_rule_id \|\| null : line\.tax_code_id \|\| null/);
});

test("Accountant coding review explains the exact failure and hands off to the exact accounting source", () => {
  assert.match(rail, /function CodingReview\(\{ issue, source, line, rule, journal, navigation \}\)/);
  assert.match(rail, /VAT coding proof/);
  assert.match(rail, /Sales VAT coding/);
  assert.match(rail, /Purchase VAT coding/);
  assert.match(rail, /exact document and VAT-bearing line/);
  assert.match(rail, /VAT code missing/);
  assert.match(rail, /VAT code unavailable/);
  assert.match(rail, /VAT rule not effective/);
  assert.match(rail, /Source document/);
  assert.match(rail, /Tax line/);
  assert.match(rail, /VAT amount/);
  assert.match(rail, /Stored rule reference/);
  assert.match(rail, /Governed VAT rule/);
  assert.match(rail, /What the accountant fixes/);
  assert.match(rail, /assign the governed VAT code to this VAT-bearing line/);
  assert.match(rail, /replace the unavailable stored tax-rule reference with a governed VAT code/);
  assert.match(rail, /select a governed VAT rule that is active and effective on the document date/);
  assert.match(rail, /Fix this sales VAT line/);
  assert.match(rail, /Fix this purchase VAT line/);
  assert.match(rail, /navigation\?\.href/);
  assert.match(route, /source_navigation: exactSourceNavigation/);
});

test("Coding Evidence remains read-only and cannot fake resolution", () => {
  assert.match(rail, /Evidence identifies the failure and exact source document but cannot recode the line itself/);
  assert.match(rail, /Evidence cannot mark coding fixed; only corrected source accounting truth clears this control/);
  assert.match(rail, /const codingIssue = isCodingIssue\(issue\.code\)/);
  assert.match(rail, /!vatRuleEvidence && !codingIssue/);
  assert.match(rail, /cannot post, recode, alter FX, update a VAT rule, recalculate VAT, complete work, or mutate Business Context/);
  assert.doesNotMatch(rail, /Mark coding fixed|Acknowledge coding|Resolve coding/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(/);
});
