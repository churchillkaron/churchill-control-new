import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const resolver = read("lib/finance/accounts-payable/runtime/VendorBillProcurementEvidenceRuntime.js");
const preparation = read("lib/finance/accounts-payable/runtime/VendorBillAttachmentPreparationRuntime.js");
const apRuntime = read("lib/finance/accounts-payable/runtime/AccountsPayableRuntime.js");
const intakeRoute = read("app/api/finance/vendor-invoices/intake/route.js");
const panel = read("components/workspace/finance/FinanceApIntakePanel.jsx");
const migration = read("supabase/migrations/20260918143000_finance_ap_touchless_intake.sql");


test("non-PO supplier bills remain valid review work and are never guessed onto procurement", () => {
  assert.match(resolver, /if \(!poReference\)/);
  assert.match(resolver, /status: "NOT_REFERENCED"/);
  assert.match(resolver, /purchase_order_id: null/);
  assert.match(resolver, /goods_receipt_id: null/);
  assert.match(resolver, /touchless_eligible: false/);
});

test("PO resolution is exact vendor/entity/reference based and never amount or description based", () => {
  assert.match(resolver, /\.eq\("entity_id", entityId\)/);
  assert.match(resolver, /\.eq\("supplier_party_id", vendorPartyId\)/);
  assert.match(resolver, /normalizeRef\(row\.po_number\) === normalizeRef\(poReference\)/);
  assert.doesNotMatch(resolver, /total_amount.*poReference|description.*poReference/);
  assert.match(resolver, /RECEIPT_AMBIGUOUS/);
  assert.match(resolver, /LINE_LINKAGE_INCOMPLETE/);
});

test("line linkage uses explicit PO line or exact inventory identity and refuses fuzzy descriptions", () => {
  assert.match(resolver, /explicitPoItemId/);
  assert.match(resolver, /row\.item_id === line\.item_id/);
  assert.match(resolver, /purchase_order_item_id === poItem\.id/);
  assert.doesNotMatch(resolver, /item_name.*description|description.*item_name/);
});

test("vendor bill preparation carries exact procurement lineage into canonical AP creation", () => {
  assert.match(preparation, /resolveVendorBillProcurementEvidence/);
  assert.match(preparation, /purchase_order_id: procurement\.purchase_order_id/);
  assert.match(preparation, /goods_receipt_id: procurement\.goods_receipt_id/);
  assert.match(preparation, /READY_FOR_CREATE_AND_MATCH/);
  assert.match(preparation, /CLARIFICATION_REQUIRED/);
});

test("touchless AP runs formal match but never auto approves posts or pays", () => {
  assert.match(apRuntime, /runThreeWayMatch/);
  assert.match(apRuntime, /READY_FOR_APPROVAL/);
  assert.match(apRuntime, /EXCEPTION_REVIEW/);
  assert.match(apRuntime, /approval_required: true/);
  assert.match(apRuntime, /auto_approved: false/);
  const runAllBlock = apRuntime.slice(apRuntime.indexOf("async runAll(input)"), apRuntime.lastIndexOf("\n  },\n};"));
  assert.doesNotMatch(runAllBlock, /approveVendorInvoice|finance_approve_vendor_invoice|processVendorPayment/);
});

test("AP inbox is durable controlled evidence and server-authoritative on confirmation", () => {
  assert.match(migration, /finance_ap_intake_items/);
  assert.match(migration, /enterprise_document_id uuid references public\.enterprise_documents/);
  assert.match(migration, /unique \(organization_id, entity_id, source_sha256, logical_object_id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(intakeRoute, /createControlledDocument/);
  assert.match(intakeRoute, /SUPPLIER_INVOICE_SOURCE/);
  assert.match(intakeRoute, /resolveCandidateFromIntake/);
  assert.match(intakeRoute, /analyzeSet/);
  assert.doesNotMatch(intakeRoute, /body\.import_payload|body\.vendor_party_id|body\.purchase_order_id/);
});

test("AP inbox makes the automation boundary clear to accountants", () => {
  assert.match(panel, /AP Inbox/);
  assert.match(panel, /Upload supplier invoice/);
  assert.match(panel, /Confirm & create bill/);
  assert.match(panel, /approval still required/);
});
