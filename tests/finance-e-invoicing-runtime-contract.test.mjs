import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { preflightThaiEtaxInvoice, buildThaiEtaxCrossIndustryInvoiceXml } from "../lib/finance/e-invoicing/runtime/ThaiEtaxSourceDocument.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260918130000_finance_e_invoicing_runtime.sql");
const runtime = read("lib/finance/e-invoicing/runtime/FinanceEInvoiceRuntime.js");
const provider = read("lib/finance/e-invoicing/providers/CertifiedEtaxRestProvider.js");
const registry = read("lib/finance/e-invoicing/providers/EInvoiceProviderRegistry.js");
const validation = read("lib/finance/workspaces/FinanceWorkspaceWriteValidation.js");
const panel = read("components/workspace/finance/FinanceEInvoicePanel.jsx");
const callback = read("app/api/public/finance/e-invoice/[transmissionId]/callback/route.js");

const fixture = {
  invoice: { id: "inv-1", invoice_number: "INV-2026-001", invoice_date: "2026-09-18", currency_code: "THB", subtotal: 1000, tax_amount: 70, total_amount: 1070, outstanding_amount: 1070, status: "OPEN" },
  lines: [{ description: "Professional service", quantity: 1, unit_price: 1000, line_total: 1000, tax_amount: 70, tax_rate: 0.07, tax_rule_id: "tax-1" }],
  seller: { legal_name: "Seller Co., Ltd.", tax_id: "0123456789012", country: "TH", address: "1 Road, Bangkok" },
  buyer: { legal_name: "Buyer Co., Ltd.", tax_id: "0999999999999", country: "TH", address: "2 Road, Phuket" },
  setting: { jurisdiction_code: "TH", document_type: "CUSTOMER_INVOICE", standard_code: "ETDA_CII" },
};

test("Thai e-Tax preflight requires exact legal and tax evidence", () => {
  assert.equal(preflightThaiEtaxInvoice(fixture).ready, true);
  const bad = structuredClone(fixture); delete bad.buyer.tax_id; bad.lines[0].tax_rule_id = null;
  const result = preflightThaiEtaxInvoice(bad);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((row) => row.code === "BUYER_TAX_ID_REQUIRED"));
  assert.ok(result.blockers.some((row) => row.code === "LINE_TAX_EVIDENCE_REQUIRED"));
});

test("ETDA source XML binds invoice identity parties lines tax currency and totals", () => {
  const result = buildThaiEtaxCrossIndustryInvoiceXml(fixture);
  assert.match(result.xml, /TaxInvoice_CrossIndustryInvoice/);
  assert.match(result.xml, /INV-2026-001/);
  assert.match(result.xml, /Seller Co\.\, Ltd\./);
  assert.match(result.xml, /Buyer Co\.\, Ltd\./);
  assert.match(result.xml, /Professional service/);
  assert.match(result.xml, /<ram:TypeCode>VAT<\/ram:TypeCode>/);
  assert.match(result.xml, /<ram:GrandTotalAmount currencyID="THB">1070\.00<\/ram:GrandTotalAmount>/);
  assert.equal(result.source_hash.length, 64);
});

test("e-Invoice lifecycle is durable idempotent and service-role isolated", () => {
  assert.match(migration, /finance_e_invoice_transmissions/);
  assert.match(migration, /unique \(organization_id, customer_invoice_id, source_hash\)/);
  assert.match(migration, /unique \(organization_id, idempotency_key\)/);
  assert.match(migration, /finance_e_invoice_events/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.finance_e_invoice_transmissions from anon, authenticated/);
});

test("certified provider transport is endpoint-configured and credential-vault backed", () => {
  assert.match(provider, /config\.base_url/);
  assert.match(provider, /config\.upload_path/);
  assert.match(provider, /xml_base64/);
  assert.match(provider, /callback_url/);
  assert.match(registry, /netbay_invoicechain/);
  assert.match(registry, /inet_etax/);
  assert.match(runtime, /resolveProviderCredentialSecret/);
  assert.doesNotMatch(runtime, /process\.env\..*ETAX|process\.env\..*NETBAY/);
});

test("active e-Invoicing profile cannot exist without supported certified-provider credential", () => {
  assert.match(validation, /E_INVOICE_PROVIDERS/);
  assert.match(validation, /Install the certified e-Invoice provider credential before activating this profile/);
  assert.match(validation, /provider_credential_id = credential\?\.id/);
  assert.match(validation, /provider_status = credential \? "READY" : "CREDENTIAL_REQUIRED"/);
});

test("transmission never mutates accounting truth and rejects blind resend after authority rejection", () => {
  assert.doesNotMatch(runtime, /from\("general_ledger"\).*insert/s);
  assert.doesNotMatch(runtime, /from\("journal_entries"\).*insert/s);
  assert.match(runtime, /E_INVOICE_REJECTED_SOURCE_UNCHANGED/);
  assert.match(runtime, /source_hash/);
  assert.match(runtime, /idempotencyKey/);
});

test("provider callback is exact-transmission token bound and event deduplicated", () => {
  assert.match(runtime, /timingSafeEqual/);
  assert.match(runtime, /callback_token_hash/);
  assert.match(runtime, /finance_e_invoice_events/);
  assert.match(runtime, /providerEventId/);
  assert.match(callback, /processEInvoiceCallback/);
});

test("invoice review panel shows readiness blockers provider state and governed actions", () => {
  assert.match(panel, /Thailand e-Tax/);
  assert.match(panel, /Configure e-Invoicing/);
  assert.match(panel, /Submit e-Tax/);
  assert.match(panel, /Check status/);
  assert.match(panel, /Authority reference/);
});
