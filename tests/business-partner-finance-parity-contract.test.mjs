import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const capabilityCatalog = await readFile(new URL("../lib/operator/runtime/OperatorCapabilityCatalog.js", import.meta.url), "utf8");
const navigationCatalog = await readFile(new URL("../lib/operator/runtime/OperatorNavigationCatalog.js", import.meta.url), "utf8");
const attachmentRouting = await readFile(new URL("../lib/platform/runtime/UniversalAttachmentRoutingRuntime.js", import.meta.url), "utf8");
const operatorTurn = await readFile(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
const createCoverage = await readFile(new URL("../lib/platform/registry/OperatorRegistryCreateCoverage.js", import.meta.url), "utf8");
const registryDomainRuntimes = await readFile(new URL("../lib/platform/registry/OperatorRegistryDomainRuntimes.js", import.meta.url), "utf8");
const domainRuntimeRegistry = await readFile(new URL("../lib/ubte/runtime/domains/DomainRuntimeRegistry.js", import.meta.url), "utf8");
const fastReads = await readFile(new URL("../lib/operator/runtime/OperatorFastReadIndex.js", import.meta.url), "utf8");
const registryBridge = await readFile(new URL("../lib/platform/registry/operatorRegistryBridge.js", import.meta.url), "utf8");

test("Business Partner execution comes from governed capabilities, not a separate Finance action list", () => {
  assert.match(capabilityCatalog, /listDomainRuntimeNames/);
  assert.match(capabilityCatalog, /getDomainRuntime/);
  assert.match(capabilityCatalog, /operator_enabled: operatorEnabled/);
  assert.match(capabilityCatalog, /input_schema:/);
  assert.match(capabilityCatalog, /permissions:/);
  assert.match(capabilityCatalog, /requires_confirmation:/);
});

test("Business Partner navigation stays in parity with active ERP registry surfaces", () => {
  assert.match(navigationCatalog, /ERP_REGISTRY/);
  assert.match(navigationCatalog, /for \(const \[workspaceId, workspace\]/);
  assert.match(navigationCatalog, /activeItem\(item\)/);
  assert.match(navigationCatalog, /capabilityId: item\.id/);
});

test("Finance uploads enter the authoritative operator turn and route to canonical Finance workspaces", () => {
  for (const symbol of ["conversationAttachmentSetIdFromRequest", "loadConversationAttachmentSet", "analyzeConversationAttachments", "routeAnalyzedAttachment", "prepareBankStatementAttachment", "preparePaidExpenseReceiptAttachment", "prepareVendorBillAttachment"]) {
    assert.match(operatorTurn, new RegExp(symbol));
  }
  assert.match(attachmentRouting, /itemId: "customer_invoices"/);
  assert.match(attachmentRouting, /itemId: "vendor_bills"/);
  assert.match(attachmentRouting, /itemId: "bank_reconciliation"/);
  assert.match(attachmentRouting, /itemId: "tax"/);
  assert.match(attachmentRouting, /itemId: "journals"/);
});

test("Finance registry creates are classified for Business Partner coverage instead of silently disappearing", () => {
  assert.match(createCoverage, /item\?\.create\?\.enabled !== true/);
  assert.match(createCoverage, /classification: "generated_endpoint"/);
  assert.match(createCoverage, /classification: "delegated_ubte_reference"/);
  assert.match(createCoverage, /classification: "unavailable"/);
  assert.match(createCoverage, /capability_key:/);
  assert.match(registryDomainRuntimes, /buildOperatorRegistryCreateCoverage/);
  assert.match(registryDomainRuntimes, /createCoverage: buildOperatorRegistryCreateCoverage/);
  assert.match(domainRuntimeRegistry, /Hand written capabilities win/);
  assert.match(domainRuntimeRegistry, /capabilities\[name\] = \{ \.\.\.\(capabilities\[name\] \|\| \{\}\), \.\.\.actions \}/);
});

test("Registry create parity accepts both create.api and create.endpoint declarations", () => {
  assert.match(createCoverage, /create\.api/);
  assert.match(createCoverage, /create\.endpoint/);
  assert.match(registryBridge, /item\?\.create\?\.api \|\| item\?\.create\?\.endpoint/);
  assert.match(registryBridge, /declaredCreateEndpoint\(item\) \|\| collectionCreateEndpoint\(item\)/);
});

test("Finance procurement creates are conversational and exactly verifiable", async () => {
  const registry = await readFile(new URL("../lib/platform/registry/erpRegistry.base.js", import.meta.url), "utf8");
  const purchaseOrders = await readFile(new URL("../app/api/procurement/purchase-orders/list/route.js", import.meta.url), "utf8");
  const receiving = await readFile(new URL("../app/api/procurement/receiving/list/route.js", import.meta.url), "utf8");
  const purchaseOrderCreate = await readFile(new URL("../app/api/procurement/purchase-orders/route.js", import.meta.url), "utf8");
  const receiptCreate = await readFile(new URL("../app/api/procurement/receiving/route.js", import.meta.url), "utf8");

  assert.match(registry, /id: "purchase_orders"[\s\S]*?api: "\/api\/procurement\/purchase-orders"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"purchase_order_id"/);
  assert.match(registry, /id: "goods_receipts"[\s\S]*?api: "\/api\/procurement\/receiving"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"goods_receipt_id"/);
  assert.match(purchaseOrderCreate, /purchase_order_id: result\?\.purchase_order\?\.id/);
  assert.match(receiptCreate, /goods_receipt_id: goodsReceiptId/);
  assert.match(purchaseOrders, /query = query\.eq\("entity_id", entityId\)/);
  assert.match(purchaseOrders, /query = query\.eq\("id", purchaseOrderId\)/);
  assert.match(receiving, /query = query\.eq\("entity_id", entityId\)/);
  assert.match(receiving, /query = query\.eq\("id", goodsReceiptId\)/);
});

test("Common Finance reads stay on the low-cost deterministic path", () => {
  for (const key of [
    "finance.customer_invoices.read",
    "finance.vendor_bills.read",
    "finance.bank_statements.read",
    "finance.journals.read",
    "finance.cash_management.read",
    "finance.trial_balance.read",
  ]) {
    assert.match(fastReads, new RegExp(key.replaceAll(".", "\\.")));
  }
  assert.match(fastReads, /ai_enabled: false/);
  assert.match(fastReads, /auto_execute: true/);
  assert.match(fastReads, /requires_confirmation: false/);
});

test("Core Finance creates expose authoritative identities and exact verification filters", async () => {
  const registry = await readFile(new URL("../lib/platform/registry/erpRegistry.base.js", import.meta.url), "utf8");
  const accountCreate = await readFile(new URL("../app/api/finance/chart-of-accounts/upsert/route.js", import.meta.url), "utf8");
  const accountRead = await readFile(new URL("../app/api/finance/chart-of-accounts/route.js", import.meta.url), "utf8");
  const journalCreate = await readFile(new URL("../app/api/finance/journals/create/route.js", import.meta.url), "utf8");
  const journalRead = await readFile(new URL("../app/api/finance/journals/route.js", import.meta.url), "utf8");
  const vendorCreate = await readFile(new URL("../app/api/finance/vendors/upsert/route.js", import.meta.url), "utf8");
  const vendorRead = await readFile(new URL("../app/api/finance/vendors/route.js", import.meta.url), "utf8");
  const bankCreate = await readFile(new URL("../app/api/finance/bank-accounts/upsert/route.js", import.meta.url), "utf8");
  const bankRead = await readFile(new URL("../app/api/finance/bank-accounts/route.js", import.meta.url), "utf8");

  assert.match(registry, /id: "chart_of_accounts"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"account_id"/);
  assert.match(registry, /id: "journals"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"journal_id"/);
  assert.match(registry, /id: "vendors"[\s\S]*?identity:"party_id"/);
  assert.match(registry, /id: "bank_accounts"[\s\S]*?identity:"bank_account_id"/);

  assert.match(accountCreate, /account_id: account\?\.id/);
  assert.match(accountRead, /searchParams\.get\("account_id"\)/);
  assert.match(journalCreate, /result\?\.journal\?\.id/);
  assert.match(journalRead, /journalQuery = journalQuery\.eq\("id", journalId\)/);
  assert.match(vendorCreate, /party_id: vendor\?\.party_id \|\| vendor\?\.id/);
  assert.match(vendorRead, /query = query\.eq\("party_id", partyId\)/);
  assert.match(bankCreate, /bank_account_id: result\?\.bankAccount\?\.id/);
  assert.match(bankRead, /searchParams\.get\("bank_account_id"\)/);
});

test("Finance does not advertise create actions without an executable write contract", async () => {
  const registry = await readFile(new URL("../lib/platform/registry/erpRegistry.base.js", import.meta.url), "utf8");
  for (const item of ["accounts_receivable", "invoice_matching", "cash_flow", "tax", "audit_trail"]) {
    const pattern = new RegExp(`id: "${item}"[\\s\\S]*?create:\\s*\\{[\\s\\S]*?enabled\\s*:\\s*false`);
    assert.match(registry, pattern);
  }
});

test("Extended Finance document creates expose exact verification identities", async () => {
  const registry = await readFile(new URL("../lib/platform/registry/erpRegistry.base.js", import.meta.url), "utf8");
  const cases = [
    ["tax_codes", "tax_code_id", "../app/api/finance/tax-codes/upsert/route.js", "../app/api/finance/tax-codes/route.js"],
    ["fixed_assets", "asset_id", "../app/api/finance/fixed-assets/create/route.js", "../app/api/finance/fixed-assets/list/route.js"],
    ["legal_entities", "legal_entity_id", "../app/api/finance/legal-entities/create/route.js", "../app/api/finance/legal-entities/list/route.js"],
    ["cost_centers", "cost_center_id", "../app/api/finance/cost-centers/create/route.js", "../app/api/finance/cost-centers/list/route.js"],
    ["currencies", "currency_id", "../app/api/finance/currencies/upsert/route.js", "../app/api/finance/currencies/route.js"],
    ["intercompany", "intercompany_transaction_id", "../app/api/finance/intercompany/create/route.js", "../app/api/finance/intercompany/runtime/route.js"],
    ["payment_terms", "payment_term_id", "../app/api/finance/payment-terms/upsert/route.js", "../app/api/finance/payment-terms/route.js"],
    ["budgeting", "budget_id", "../app/api/finance/budgeting/create/route.js", "../app/api/finance/budgeting/runtime/route.js"],
  ];

  for (const [workspace, identity, createPath, readPath] of cases) {
    const createRoute = await readFile(new URL(createPath, import.meta.url), "utf8");
    const readRoute = await readFile(new URL(readPath, import.meta.url), "utf8");
    assert.match(registry, new RegExp(`id: "${workspace}"[\\s\\S]*?identity:"${identity}"`));
    assert.match(createRoute, new RegExp(`${identity}:`));
    assert.match(readRoute, new RegExp(identity));
  }

  assert.match(registry, /id: "cost_centers"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"cost_center_id"/);
  assert.match(registry, /id: "budgeting"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"budget_id"/);
});

test("Finance permissions are not exposed as an ambiguous generic Operator create", async () => {
  const registry = await readFile(new URL("../lib/platform/registry/erpRegistry.base.js", import.meta.url), "utf8");
  assert.match(registry, /id: "finance_permissions"[\s\S]*?create:\{[\s\S]*?enabled:false/);
});


test("Invoices and bank statement imports preserve exact create verification", async () => {
  const registry = await readFile(new URL("../lib/platform/registry/erpRegistry.base.js", import.meta.url), "utf8");
  const customerCreate = await readFile(new URL("../app/api/finance/customer-invoices/create/route.js", import.meta.url), "utf8");
  const customerRead = await readFile(new URL("../app/api/finance/customer-invoices/list/route.js", import.meta.url), "utf8");
  const vendorCreate = await readFile(new URL("../app/api/finance/vendor-invoices/create/route.js", import.meta.url), "utf8");
  const vendorRead = await readFile(new URL("../app/api/finance/vendor-invoices/list/route.js", import.meta.url), "utf8");
  const statementCreate = await readFile(new URL("../app/api/finance/bank-statements/import/route.js", import.meta.url), "utf8");
  const statementRead = await readFile(new URL("../app/api/finance/bank-statements/runtime/route.js", import.meta.url), "utf8");

  assert.match(registry, /id: "customer_invoices"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"invoice_id"/);
  assert.match(customerCreate, /invoice_id:/);
  assert.match(customerRead, /searchParams\.get\("invoice_id"\)/);
  assert.match(registry, /id: "vendor_bills"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"vendor_invoice_id"/);
  assert.match(vendorCreate, /vendor_invoice_id:/);
  assert.match(vendorRead, /searchParams\.get\("vendor_invoice_id"\)/);
  assert.match(registry, /id: "bank_statements"[\s\S]*?contextScope:"entity"[\s\S]*?identity:"statement_import_id"/);
  assert.match(statementCreate, /statement_import_id: statementImportId/);
  assert.match(statementRead, /searchParams\.get\("statement_import_id"\)/);
});


test("Finance access verification is exact and read-only", async () => {
  const runtime = await readFile(new URL("../lib/finance/FinanceRuntime.js", import.meta.url), "utf8");
  const verifier = await readFile(new URL("../lib/finance/security/capabilities/readFinanceAccessEvidence.js", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/finance/role-permissions/list/route.js", import.meta.url), "utf8");

  assert.match(runtime, /finance_access:[\s\S]*?read:/);
  assert.match(verifier, /capability: "finance_access"/);
  assert.match(verifier, /operatorMode: "read"/);
  assert.match(verifier, /operatorRequiresConfirmation: false/);
  assert.match(verifier, /assignment_id or permission_grant_id required/);
  assert.match(route, /searchParams\.get\("assignment_id"\)/);
  assert.match(route, /searchParams\.get\("permission_grant_id"\)/);
  assert.match(route, /allGrants\.filter/);
  assert.match(route, /allAssignments\.filter/);
});


test("High-impact Finance writes require high-risk confirmation and exact verification", async () => {
  const invoice = await readFile(new URL("../lib/finance/accounts-receivable/CreateCustomerInvoice/execute.js", import.meta.url), "utf8");
  const statement = await readFile(new URL("../lib/finance/bank-statements/capabilities/importBankStatement.js", import.meta.url), "utf8");

  for (const source of [invoice, statement]) {
    assert.match(source, /operatorAutoExecute: false/);
    assert.match(source, /operatorRequiresConfirmation: true/);
    assert.match(source, /risk: "high"/);
    assert.match(source, /operatorVerification:/);
  }
});
