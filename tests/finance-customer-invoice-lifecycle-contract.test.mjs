import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

const registry = read("lib/platform/registry/erpRegistry.base.js");
const listRoute = read("app/api/finance/customer-invoices/list/route.js");
const attachmentsRoute = read("app/api/finance/attachments/route.js");
const records = read("components/workspace/finance/FinanceAccountantRecordsWorkCenter.jsx");
const rowEngine = read("components/workspace/engines/RowActionEngine.jsx");
const forms = read("lib/platform/forms/FinanceFormContract.js");
const actionMenu = read("components/workspace/actions/MasterActionMenu.jsx");
const topBar = read("components/workspace/WorkspaceTopBar.jsx");
const presentation = read("lib/finance/ui/FinanceCapabilityPresentation.js");
const reviewPanel = read("components/workspace/finance/FinanceRecordReviewPanel.jsx");

test("customer invoice row lifecycle exposes only executable accounting actions", () => {
  const marker = '{ id: "customer_invoices", name: "Customer Invoices", route: "/finance/customer-invoices", description: "Create, review, post and send customer invoices."';
  const start = registry.indexOf(marker);
  const end = registry.indexOf('{ id: "accounts_receivable"', start);
  assert.ok(start >= 0 && end > start, "canonical Finance customer invoice registry block must exist");
  const block = registry.slice(start, end);

  assert.match(block, /id: "record_payment"/);
  assert.match(block, /label: "Record Payment"/);
  assert.match(block, /endpoint: "\/api\/finance\/customer-payments\/create"/);
  assert.match(block, /label: "Duplicate as New Invoice"/);
  assert.match(block, /id: "attachments"/);
  assert.match(block, /id: "history"/);
  assert.match(block, /engine:"preview"/);
  assert.doesNotMatch(block, /type: "delete"/);
  assert.doesNotMatch(block, /type: "edit"/);
});
test("customer invoice list is entity scoped and returns complete review/duplicate evidence", () => {
  assert.match(listRoute, /resolveEntity/);
  assert.match(listRoute, /invoiceQuery = invoiceQuery\.eq\("entity_id", entity\.id\)/);
  assert.match(listRoute, /from\("customer_invoice_lines"\)/);
  assert.match(listRoute, /from\("parties"\)/);
  assert.match(listRoute, /customer_name:/);
  assert.match(listRoute, /lines: linesByInvoice/);
});

test("duplicate opens a new invoice with copied business content, never the source identity", () => {
  assert.match(records, /capability\?\.id === "customer_invoices" && action\?\.id === "duplicate"/);
  assert.match(records, /row\.lines\.map/);
  assert.match(records, /item_id: line\.item_id/);
  assert.match(records, /discount_amount: Number\(line\.discount_amount/);
  assert.match(records, /revenue_account_id: line\.revenue_account_id/);
  assert.match(records, /cost_center_id: line\.cost_center_id/);
  assert.match(records, /department_id: line\.department_id/);
  assert.match(records, /project_id: line\.project_id/);
  assert.match(records, /createEngine\.show\(\)/);
});

test("record payment is invoice-bound, idempotent and requires a real bank account", () => {
  assert.match(rowEngine, /const isCustomerInvoice = moduleKey === "customer_invoices"/);
  assert.match(rowEngine, /customer_invoice_id: row\?\.customer_invoice_id \|\| \(isCustomerInvoice \? row\?\.id : null\)/);
  assert.match(rowEngine, /outstanding_amount \?\? row\?\.outstanding_balance \?\? row\?\.total_amount/);
  assert.match(rowEngine, /idempotency_key: globalThis\.crypto\?\.randomUUID/);
  assert.match(rowEngine, /bank_account_id: row\?\.bank_account_id \|\| null/);
  assert.doesNotMatch(rowEngine, /bank_account_id: row\?\.id/);
  assert.match(forms, /label: "Deposit Bank Account"/);
  assert.match(forms, /lookup: "bank_accounts"/);
  assert.match(forms, /name: "bank_account_id"[\s\S]{0,160}required: true/);
});
test("invoice attachments preserve organization and legal-entity ownership", () => {
  assert.match(attachmentsRoute, /customer_invoice/);
  assert.match(attachmentsRoute, /\? "customer_invoices"/);
  assert.match(attachmentsRoute, /\.eq\("organization_id", organizationId\)/);
  assert.match(attachmentsRoute, /query = query\.eq\("entity_id", entityId\)/);
  assert.match(actionMenu, /"customer_invoices"/);
  assert.match(actionMenu, /\? "customer_invoice"/);
  assert.match(actionMenu, /surface = "dark"/);
  assert.match(actionMenu, /surface === "light"/);
});

test("preview reaches the Finance PreviewEngine after the shared engine event", () => {
  assert.match(records, /addEventListener\("workspace:engine"/);
  assert.match(records, /activeEngine\.engine === "preview"/);
  assert.match(records, /<PreviewEngine/);
});

test("an organization with available entities can recover from an empty active entity", () => {
  assert.doesNotMatch(topBar, /if \(!entity \|\| !available\.length\) return null/);
  assert.match(topBar, /if \(!available\.length\) return null/);
  assert.match(topBar, /!entity && available\.length === 1/);
  assert.match(topBar, /switchEntity\(available\[0\]\)/);
  assert.match(topBar, /fetch\("\/api\/session\/entity"/);
});

test("customer invoice list presents invoice total separately from outstanding balance", () => {
  assert.match(presentation, /customer_invoice:\s*\[/);
  assert.match(presentation, /label: "Invoice total"[\s\S]{0,120}keys: \["total_amount"/);
  assert.match(presentation, /label: "Outstanding"[\s\S]{0,140}"outstanding_balance"/);
  assert.match(presentation, /default_sort_index: capabilityId === "customer_invoices" \? 2 : 0/);
  assert.match(presentation, /default_sort_direction: capabilityId === "customer_invoices" \? "desc" : "asc"/);
  assert.match(presentation, /capabilityId === "customer_invoices"[\s\S]{0,120}COLUMN_SETS\.customer_invoice/);
  assert.match(records, /presentation\.default_sort_direction === "desc" \? "desc" : "asc"/);
});

test("record review counts invoice line items and displays their line totals", () => {
  assert.match(reviewPanel, /const collectionItemCount = useMemo/);
  assert.match(reviewPanel, /collections\.reduce\(\(total, \[, items\]\) => total \+ items\.length, 0\)/);
  assert.match(reviewPanel, /Lines \{collectionItemCount \? `\(\$\{collectionItemCount\}\)`/);
  assert.match(reviewPanel, /item\?\.line_total \?\? item\?\.amount/);
});

test("canonical route ownership wins when another workspace links to the same route", () => {
  const commercialAlias = registry.indexOf('{ id: "customer_invoices", name: "Customer Invoices", route: "/finance/customer-invoices", description: "Create and review customer invoices."');
  const financeCanonical = registry.indexOf('{ id: "customer_invoices", name: "Customer Invoices", route: "/finance/customer-invoices", description: "Create, review, post and send customer invoices."');
  assert.ok(commercialAlias >= 0 && financeCanonical > commercialAlias, "route collision fixture must remain detectable");
  assert.match(registry, /const routeWorkspaceId = cleanRoute\.split\("\/"\)\.filter\(Boolean\)\[0\] \|\| null/);
  assert.match(registry, /if \(leftId === routeWorkspaceId\) return -1/);
  assert.match(registry, /if \(rightId === routeWorkspaceId\) return 1/);
  assert.match(registry, /workspaceId: workspace\.id \|\| workspaceKey/);
});
