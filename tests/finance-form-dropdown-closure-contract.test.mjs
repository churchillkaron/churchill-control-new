import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const lookupRegistry = read("lib/platform/erp-engine/lookups/LookupRegistry.js");
const createPolicy = read("lib/platform/forms/LookupCreatePolicy.js");
const dynamicForm = read("components/workspace/engines/DynamicForm.jsx");
const dynamicTable = read("components/workspace/engines/DynamicTableField.jsx");
const financeForm = read("lib/platform/forms/FinanceFormContract.js");
const receiptForm = read("lib/platform/forms/FinanceReceiptFormContract.js");
const vendorPaymentForm = read("lib/platform/forms/FinanceVendorPaymentFormContract.js");
const budgetForm = read("lib/finance/budgeting/BudgetFormContract.js");
const dimensionForm = read("lib/finance/dimensions/FinanceDimensionFormContract.js");
const workspaceContracts = read("lib/finance/workspaces/FinanceWorkspaceContracts.js");
const configConvergence = read("lib/finance/workspaces/FinanceConfigurationContractConvergence.js");
const vendorLookup = read("lib/platform/erp-engine/lookups/providers/VendorLookup.js");
const customerLookup = read("lib/platform/erp-engine/lookups/providers/CustomerLookup.js");
const bankLookup = read("lib/platform/erp-engine/lookups/providers/BankAccountLookup.js");
const apLookup = read("lib/platform/erp-engine/lookups/providers/AccountsPayableLookup.js");
const openInvoiceLookup = read("lib/platform/erp-engine/lookups/providers/OpenCustomerInvoiceLookup.js");
const journalLookup = read("lib/platform/erp-engine/lookups/providers/JournalLookup.js");
const recordsCenter = read("components/workspace/finance/FinanceAccountantRecordsWorkCenter.jsx");
const bankStatementsCenter = read("components/workspace/finance/FinanceBankStatementsWorkCenter.jsx");

function financeLookupKeys() {
  const files = [
    "lib/platform/forms/FinanceFormContract.js",
    "lib/platform/forms/FinanceFixedAssetFormContract.js",
    "lib/platform/forms/FinancePermissionFormContract.js",
    "lib/platform/forms/FinanceReceiptFormContract.js",
    "lib/platform/forms/FinanceVendorPaymentFormContract.js",
    "lib/platform/forms/FinanceOperationalFormContract.js",
    "lib/finance/budgeting/BudgetFormContract.js",
    "lib/finance/chart-of-accounts/ChartOfAccountFormContract.js",
    "lib/finance/dimensions/FinanceDimensionFormContract.js",
    "lib/finance/intercompany/IntercompanyFormContract.js",
    "lib/finance/workspaces/FinanceWorkspaceContracts.js",
    "lib/finance/workspaces/FinanceConfigurationContractConvergence.js",
    "lib/finance/workspaces/FinanceVatTaxContractConvergence.js",
  ];
  const keys = new Set();
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/lookup:\s*["']([^"']+)["']/g)) keys.add(match[1]);
  }
  return [...keys].sort();
}

function registeredLookupKeys() {
  const keys = new Set([...lookupRegistry.matchAll(/["']([^"']+)["']:\s*[A-Za-z]/g)].map((m) => m[1]));
  keys.add("account-types");
  return keys;
}

test("every Finance lookup referenced by a form is registered", () => {
  const registered = registeredLookupKeys();
  const missing = financeLookupKeys().filter((key) => !registered.has(key));
  assert.deepEqual(missing, [], `Missing Finance lookup providers: ${missing.join(", ")}`);
});

test("creatable Finance lookups have a real Create path and reference-only lookups stay explicit", () => {
  const intentionallyReferenceOnly = new Set(["finance_roles", "finance_role_codes", "reporting_groups"]);
  const policyKeys = new Set([...createPolicy.matchAll(/^\s{2}([a-z0-9_]+):\s*\{/gm)].map((m) => m[1]));
  const missingPolicy = financeLookupKeys().filter((key) => !policyKeys.has(key) && !intentionallyReferenceOnly.has(key));
  assert.deepEqual(missingPolicy, [], `Finance dropdowns missing Create policy: ${missingPolicy.join(", ")}`);
  assert.match(createPolicy, /mode: "inline"/);
  assert.match(createPolicy, /\?create=1/);
  assert.match(recordsCenter, /createRequested/);
  assert.match(recordsCenter, /openCreate\(\)/);
  assert.match(bankStatementsCenter, /createRequested/);
});

test("transaction identities and legal-entity scope are canonical", () => {
  assert.match(vendorLookup, /value: party\?\.id \|\| row\.party_id \|\| row\.id/);
  assert.match(vendorLookup, /row\.is_blocked !== true/);
  assert.match(customerLookup, /from\("customer_profiles"\)/);
  assert.match(customerLookup, /value: party\.id/);
  assert.match(bankLookup, /String\(row\.entity_id \|\| ""\) === String\(context\.entityId\)/);
  assert.match(bankLookup, /row\.active !== false/);
});

test("payment selectors expose only payable and receivable records", () => {
  assert.match(apLookup, /outstanding > 0/);
  assert.match(apLookup, /row\.payment_hold !== true/);
  assert.match(apLookup, /"PAID"/);
  assert.match(openInvoiceLookup, /outstanding > 0/);
  assert.match(openInvoiceLookup, /"PAID"/);
  assert.match(receiptForm, /lookup: "open_customer_invoices"/);
  assert.match(vendorPaymentForm, /lookup: "accounts_payable"/);
});

test("budget and journal forms use accounting-controlled selectors", () => {
  assert.match(budgetForm, /label: "Budget Account"/);
  assert.match(budgetForm, /lookup: "budget_categories"/);
  assert.match(journalLookup, /upper\(row\.status\) === "POSTED"/);
  assert.match(journalLookup, /row\.reversed !== true/);
  assert.match(financeForm, /name: "journal_id", label: "Posted Journal", type: "lookup", lookup: "journals"/);
});

test("invoice, vendor, bank and tax forms expose correct accounting information", () => {
  assert.match(financeForm, /lookup: payable \? "expense_accounts" : "revenue_accounts"/);
  assert.match(financeForm, /name: "finance_account_id", label: "Linked Bank GL Account", type: "lookup", lookup: "bank_gl_accounts"/);
  assert.match(financeForm, /name: "default_expense_account", label: "Default Expense Account", type: "lookup", lookup: "expense_accounts"/);
  assert.match(financeForm, /name: "default_ap_account", label: "Default Accounts Payable Account", type: "lookup", lookup: "liability_accounts"/);
  assert.match(financeForm, /name: "accounting_standard", label: "Accounting Standard"/);
  assert.doesNotMatch(financeForm, /name: "standard",\s*label: "Accounting Standard"/);
  assert.match(receiptForm, /type: "select"[\s\S]*value: "BANK_TRANSFER"/);
  assert.match(vendorPaymentForm, /type: "select"[\s\S]*value: "BANK_TRANSFER"/);
});

test("dependent and conditional Finance lookups cannot present unrelated records", () => {
  assert.match(dimensionForm, /dependsOn: "dimension_id"/);
  assert.match(dynamicForm, /field\.dependsOn/);
  assert.match(dynamicForm, /fieldIsVisible/);
  assert.match(configConvergence, /visibleWhen: \{ field: "source_document_type", equals: "CUSTOMER_INVOICE" \}/);
  assert.match(workspaceContracts, /lookup\("source_document_id", "Customer Invoice", "customer_invoices"/);
});

test("every lookup surface supports human labels and governed Create affordances", () => {
  assert.match(dynamicForm, /item\.description \? `\$\{item\.label\} · \$\{item\.description\}` : item\.label/);
  assert.match(dynamicForm, /\+ Create new \{createPolicy\.label\}/);
  assert.match(dynamicTable, /getLookupCreatePolicy/);
  assert.match(dynamicTable, /\+ Create new \{createLabel\}/);
});
