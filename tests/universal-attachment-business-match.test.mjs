import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime.js", "utf8");
const route = fs.readFileSync("app/api/operator/turn/route.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");

test("business matching is read only and non-authorizing", () => {
  assert.match(runtime, /authorization_effect: "NONE"/);
  assert.doesNotMatch(runtime, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(route, /OPERATOR_ATTACHMENT_BUSINESS_MATCH_FAILED/);
  assert.match(route, /authorization_effect: "NONE"/);
});

test("strong identifiers drive supported domain matches", () => {
  assert.match(runtime, /invoice_number/);
  assert.match(runtime, /inventory_items/);
  assert.match(runtime, /project_code/);
  assert.match(runtime, /employee_email/);
  assert.match(runtime, /employee_tax_id/);
  assert.match(runtime, /document_number/);
  assert.match(runtime, /checksum_sha256/);
});
test("weak record similarity never becomes proof", () => {
  assert.doesNotMatch(runtime, /\.eq\("name"/);
  assert.doesNotMatch(runtime, /\.eq\("total_amount"/);
  assert.doesNotMatch(runtime, /\.eq\("amount"/);
  assert.doesNotMatch(runtime, /ilike|similarity|levenshtein/);
});

test("customer invoice matching requires legal entity context", () => {
  assert.match(runtime, /if \(!invoiceNumber \|\| !entityId\) return null/);
  assert.match(runtime, /\.eq\("entity_id", entityId\)/);
});

test("ambiguous matches ask rather than selecting a record", () => {
  assert.match(runtime, /AMBIGUOUS_MATCH/);
  assert.match(runtime, /Which one should I use\?/);
  assert.match(runtime, /strongly matches more than one existing business record/);
});

test("business match evidence reaches Operator context before governed action", () => {
  assert.match(synthetic, /business_match_status=/);
  assert.match(synthetic, /authorization_effect=NONE/);
  const matchIndex = route.indexOf("const matchedConversationAttachments");
  const prepareIndex = route.indexOf("const preparedConversationAttachments");
  assert.ok(matchIndex >= 0 && prepareIndex > matchIndex);
});
