import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const draft = fs.readFileSync("lib/commercial/communications/capabilities/draftMessage.js", "utf8");
const send = fs.readFileSync("lib/commercial/communications/capabilities/sendDraftMessage.js", "utf8");
const runtime = fs.readFileSync("lib/finance/FinanceRuntime.js", "utf8");
const reads = fs.readFileSync("lib/finance/runtime/FinanceBusinessRecordVerificationCapabilities.js", "utf8");

test("Commercial communication writes match organization-scoped verifier", () => {
  assert.match(draft, /contextScope: "organization"/);
  assert.match(send, /contextScope: "organization"/);
});

test("Finance registers exact canonical record verifiers", () => {
  assert.match(runtime, /customer_invoices:[\s\S]*createCustomerInvoiceReadCapability/);
  assert.match(runtime, /vendor_bills:[\s\S]*createVendorBillReadCapability/);
  assert.match(runtime, /bank_statements:[\s\S]*createBankStatementImportReadCapability/);
});

test("Finance invoice reads are entity scoped and return canonical outcome", () => {
  assert.match(reads, /contextScope: "entity"/);
  assert.match(reads, /\.eq\("organization_id", organizationId\)\.eq\("entity_id", entityId\)\.eq\("id", id\)/);
  assert.match(reads, /AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1/);
  assert.match(reads, /state: found \? "COMPLETED" : "NOT_COMPLETED"/);
});
