import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const adapter = fs.readFileSync("lib/operator/runtime/BusinessPartnerBusinessEventAdapterRuntime.js", "utf8");
const approval = fs.readFileSync("lib/shared/approvals/executeApproval.js", "utf8");
const rejection = fs.readFileSync("lib/shared/approvals/rejectApprovalRequest.js", "utf8");
const payment = fs.readFileSync("lib/platform/payment-runtime/confirmation/PaymentConfirmationRuntime.js", "utf8");
const receipt = fs.readFileSync("lib/inventory/procurement/receiving/receivePurchaseOrder.js", "utf8");
const communication = fs.readFileSync("lib/commercial/communications/CommunicationWebhookRuntime.js", "utf8");

test("business events only feed exact wait correlations and grant no authority", () => {
  assert.match(adapter, /consumeBusinessPartnerExternalEvent/);
  assert.match(adapter, /authorization_effect: "NONE"/);
  assert.match(adapter, /new Set/);
});

test("approval decisions expose exact approval and business reference correlations", () => {
  assert.match(approval, /event_type: "APPROVAL_GRANTED"/);
  assert.match(approval, /`approval_request:\$\{workflowRequestId\}`/);
  assert.match(approval, /`reference:\$\{request\.reference_table\}:\$\{request\.reference_id\}`/);
  assert.match(rejection, /event_type: "APPROVAL_REJECTED"/);
  assert.match(rejection, /emitEvent\("APPROVAL_REJECTED"/);
});

test("verified payment settlement wakes by payment or provider reference", () => {
  assert.match(payment, /event_type: "PAYMENT_SETTLED"/);
  assert.match(payment, /`payment:\$\{payment\.id\}`/);
  assert.match(payment, /`provider_reference:\$\{settlement\.provider_reference\}`/);
  assert.ok(payment.indexOf("PaymentTransactionRepository.update") < payment.indexOf("event_type: \"PAYMENT_SETTLED\""));
});

test("goods receipt wakes by purchase order or goods receipt only after receiving completes", () => {
  assert.match(receipt, /event_type: "GOODS_RECEIPT_RECEIVED"/);
  assert.match(receipt, /`purchase_order:\$\{purchase_order_id\}`/);
  assert.match(receipt, /`goods_receipt:\$\{goodsReceiptId\}`/);
  assert.ok(receipt.indexOf("postReceiptMovementToFinance") < receipt.indexOf("event_type: \"GOODS_RECEIPT_RECEIVED\""));
});

test("all inbound communication channels feed the same reply wait adapter", () => {
  assert.match(communication, /event_source: `communication:\$\{provider\}`/);
  assert.match(communication, /event_type: "MESSAGE_RECEIVED"/);
  assert.match(communication, /`conversation:\$\{conversation\.id\}`/);
  assert.match(communication, /`thread:\$\{text\(externalThreadId\)\}`/);
  assert.match(communication, /`participant:\$\{participant\}`/);
  assert.ok(communication.indexOf("updateConversation") < communication.indexOf("event_type: \"MESSAGE_RECEIVED\""));
});
