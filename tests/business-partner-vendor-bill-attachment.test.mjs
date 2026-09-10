import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hasPreparedAttachmentReflexCandidate,
  resolvePreparedAttachmentReflex,
} from '../lib/operator/runtime/OperatorPreparedAttachmentReflex.js';

const capability = {
  key: 'finance.vendor_bills.create',
  mode: 'write',
  requires_confirmation: true,
  auto_execute: false,
};

function readyVendorBill() {
  return {
    name: 'supplier-invoice.pdf', sha256: 'abc123',
    prepared_candidate: {
      type: 'vendor_bill', recognized: true, status: 'READY_FOR_REVIEW',
      vendor: { party_id: 'supplier-party-1', vendor_code: 'VEN-001' },
      bill: { invoice_number: 'SUP-7788', invoice_date: '2026-09-10', currency_code: 'THB' },
      import_payload: {
        vendor_party_id: 'supplier-party-1', invoice_number: 'SUP-7788',
        invoice_date: '2026-09-10', currency_code: 'THB', exchange_rate: 1,
        source_attachment_sha256: 'abc123',
        lines: [{ description: 'Cleaning supplies', quantity: 1, unit_price: 1000,
          discount_amount: 0, tax_code_id: null, tax_amount: 0, line_total: 1000,
          expense_account_id: 'expense-account-1', asset_account_id: null,
          inventory_account_id: null, cost_center_id: null, department_id: null,
          project_id: null, purchase_order_item_id: null, goods_receipt_item_id: null }],
      }, authorization_effect: 'NONE',
    },
  };
}
test('ready unpaid supplier invoice stages canonical vendor bill behind confirmation', () => {
  const attachments = [readyVendorBill()];
  assert.equal(hasPreparedAttachmentReflexCandidate(attachments, 'Record this supplier invoice'), true);
  const result = resolvePreparedAttachmentReflex({
    message: 'Record this supplier invoice', entityId: 'entity-1', attachments, capabilities: [capability],
  });
  assert.equal(result.intent, 'execute');
  assert.equal(result.execution.capability_key, 'finance.vendor_bills.create');
  assert.equal(result.execution.payload.vendor_party_id, 'supplier-party-1');
  assert.match(result.response_text, /Accounts Payable vendor bill/i);
  assert.match(result.response_text, /confirmation/i);
});

test('unknown supplier invoice payment status asks before AP or paid-expense posting', () => {
  const file = readyVendorBill();
  file.prepared_candidate.status = 'CLARIFICATION_REQUIRED';
  file.prepared_candidate.clarification_question = 'Has this supplier invoice already been paid, or is it still payable to the supplier?';
  file.prepared_candidate.import_payload = null;
  const result = resolvePreparedAttachmentReflex({
    message: 'Process this supplier invoice', entityId: 'entity-1', attachments: [file], capabilities: [capability],
  });
  assert.equal(result.intent, 'clarify');
  assert.equal(result.execution.capability_key, null);
  assert.match(result.response_text, /already been paid/i);
});

test('AP capability wraps canonical createVendorInvoice and never inserts vendor_invoices directly', () => {
  const source = readFileSync('lib/finance/accounts-payable/capabilities/createVendorBill.js', 'utf8');
  assert.match(source, /createVendorInvoice/);
  assert.match(source, /finance\.payables\.manage/);
  assert.match(source, /operatorRequiresConfirmation:\s*true/);
  assert.doesNotMatch(source, /from\(["']vendor_invoices["']\).*insert/s);
});
test('supplier matching requires strong identifiers and vendor bill duplicate requires supplier party', () => {
  const source = readFileSync('lib/platform/runtime/UniversalAttachmentBusinessMatchRuntime.js', 'utf8');
  assert.match(source, /vendor_code/);
  assert.match(source, /supplier_tax_id/);
  assert.match(source, /supplier_email/);
  assert.match(source, /if \(!invoiceNumber \|\| !entityId \|\| !vendorPartyId\) return null/);
  assert.doesNotMatch(source, /supplier_name.*\.eq\(/s);
});

test('supplier invoice preparation distinguishes PAID, UNPAID and UNKNOWN', () => {
  const source = readFileSync('lib/finance/accounts-payable/runtime/VendorBillAttachmentPreparationRuntime.js', 'utf8');
  assert.match(source, /paymentStatus/);
  assert.match(source, /paid === "PAID"/);
  assert.match(source, /paid === "UNKNOWN"/);
  assert.match(source, /still payable to the supplier/);
  assert.match(source, /default_expense_account/);
  assert.match(source, /cannot resolve one exact applicable tax rule/);
});
