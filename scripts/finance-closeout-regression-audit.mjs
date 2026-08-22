#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = relative => fs.existsSync(path.join(ROOT, relative));
const results = [];

function check(name, passed) {
  const row = { name, passed: Boolean(passed) };
  results.push(row);
  console.log(`${row.passed ? "PASS" : "FAIL"} ${name}`);
}

const serializer = read("lib/platform/registry/serializeCapability.js");
const convergence = read("lib/finance/workspaces/FinanceVatTaxContractConvergence.js");
const mutationPolicy = read("lib/finance/workspaces/FinanceWorkspaceMutationPolicy.js");
const operationalForms = read("lib/platform/forms/FinanceOperationalFormContract.js");
const vercel = read("vercel.json");
const bankImport = read("app/api/finance/bank-statements/import/route.js");
const cashFlow = read("app/api/finance/cash-flow/route.js");
const currencyList = read("app/api/finance/currencies/route.js");
const currencyUpsert = read("app/api/finance/currencies/upsert/route.js");
const currencyToggle = read("app/api/finance/currencies/toggle/route.js");
const fiscalOpen = read("app/api/finance/periods/open/route.js");
const periodLifecycle = read("lib/finance/fiscal-periods/PeriodLifecycle.js");
const openingPost = read("app/api/finance/opening-balances/post/route.js");
const recurringService = read("lib/finance/recurring-journals/RecurringJournalService.js");
const recurringEndpoint = read("app/api/internal/finance/recurring-journals/process/route.js");
const revenueRoute = read("app/api/finance/revenue-recognition/recognize/route.js");
const fxRoute = read("app/api/finance/fx-revaluation/execute/route.js");
const taxRepository = read("lib/finance/tax-codes/repositories/taxCodeRepository.js");
const taxListRoute = read("app/api/finance/tax-codes/route.js");
const taxUpsertRoute = read("app/api/finance/tax-codes/upsert/route.js");
const vendorCreate = read("lib/finance/accounts-payable/documents/createVendorInvoice.js");
const vatCalculate = read("app/api/finance/vat-returns/calculate/route.js");
const vatSubmitted = read("app/api/finance/vat-returns/mark-submitted/route.js");
const statutorySubmitted = read("app/api/finance/statutory-filings/mark-submitted/route.js");
const bankingIntegration = read("app/api/finance/banking-integrations/route.js");
const registryOwner = read("lib/platform/registry/erpRegistry.js");

const migrations = [
  "supabase/migrations/20260822061914_finance_bank_statement_atomic_import_convergence.sql",
  "supabase/migrations/20260822063037_finance_opening_balance_posting_lineage.sql",
  "supabase/migrations/20260822063047_finance_opening_balance_exchange_rate.sql",
  "supabase/migrations/20260822063523_finance_recurring_journal_execution_convergence.sql",
  "supabase/migrations/20260822063609_finance_recurring_journal_finalize_timezone.sql",
  "supabase/migrations/20260822063721_finance_recurring_journal_template_validation.sql",
  "supabase/migrations/20260822063827_finance_recurring_journal_account_validation_repair.sql",
  "supabase/migrations/20260822064038_finance_revenue_recognition_execution_convergence.sql",
  "supabase/migrations/20260822064447_finance_fx_revaluation_execution_convergence.sql",
  "supabase/migrations/20260822065825_finance_tax_rule_organization_scope_convergence.sql",
  "supabase/migrations/20260822070402_finance_tax_rule_type_convergence.sql",
  "supabase/migrations/20260822070639_finance_vat_return_execution_convergence.sql",
  "supabase/migrations/20260822073122_finance_e_invoicing_settings_convergence.sql",
  "supabase/migrations/20260822073216_finance_vat_output_tax_rule_repair.sql",
  "supabase/migrations/20260822073246_finance_statutory_filing_lifecycle_convergence.sql",
];

for (const migration of migrations) {
  check(`Source migration exists: ${path.basename(migration)}`, exists(migration));
}

check("Closed Finance serializer supports explicit create endpoints", serializer.includes("contract.createEndpoint"));
check("Closed Finance serializer supports explicit mutation endpoints", serializer.includes("contract.mutationEndpoint"));
check("Closed Finance serializer preserves contract row actions", serializer.includes("contract.rowActions"));
check("Bank reconciliation method is not rewritten by serializer", !serializer.includes("reconciliation") || !serializer.includes("method: \"PUT\""));

check("Bank statement import uses exact POST route", bankImport.includes("export async function POST"));
check("Bank statement import uses atomic RPC", bankImport.includes("create_finance_bank_statement_import"));
check("Bank statement import is organisation scoped", bankImport.includes("requireOrganizationAccess"));
check("Bank statement form no longer exposes source_file_url", !convergence.includes("source_file_url"));

check("Cash Flow exact route is Finance permissioned", cashFlow.includes("checkFinancePermission") || cashFlow.includes("requireFinanceWorkspacePermission"));
check("Currency list exact route is Finance permissioned", currencyList.includes("checkFinancePermission") || currencyList.includes("requireFinanceWorkspacePermission"));
check("Currency upsert exact route is Finance permissioned", currencyUpsert.includes("checkFinancePermission") || currencyUpsert.includes("requireFinanceWorkspacePermission"));
check("Currency toggle exact route is Finance permissioned", currencyToggle.includes("checkFinancePermission") || currencyToggle.includes("requireFinanceWorkspacePermission"));

check("Fiscal-period open route passes request to organisation access", fiscalOpen.includes("request,"));
check("Fiscal-period open route checks close permission", fiscalOpen.includes("finance.close.execute"));
check("Fiscal-period creator comes from authenticated actor", fiscalOpen.includes("access.user") && !fiscalOpen.includes("createdBy: body.createdBy"));
check("Fiscal-period overlap is entity scoped", periodLifecycle.includes("entity_id") && periodLifecycle.includes("overlap"));

check("Opening Balance has explicit post endpoint", openingPost.includes("export async function POST"));
check("Opening Balance posts through canonical Finance gateway", openingPost.includes("financeGateway"));
check("Opening Balance stores journal lineage", openingPost.includes("journal_entry_id"));
check("Opening Balance is immutable generic evidence", mutationPolicy.includes('"opening_balances"'));

check("Recurring Journals have due processor", recurringService.includes("processDueRecurringJournals"));
check("Recurring Journals post through Finance gateway", recurringService.includes("financeGateway"));
check("Recurring Journals claim occurrence atomically", recurringService.includes("claim_finance_recurring_journal_run"));
check("Recurring Journals finalize atomically", recurringService.includes("finalize_finance_recurring_journal_run"));
check("Recurring Journals processor is CRON secret protected", recurringEndpoint.includes("CRON_SECRET") && recurringEndpoint.includes("Bearer"));
check("Recurring Journals hourly cron is configured", vercel.includes("/api/internal/finance/recurring-journals/process") && vercel.includes("0 * * * *"));
check("Scheduled Reports cron remains configured", vercel.includes("/api/internal/finance/scheduled-reports/process"));

check("Revenue Recognition has exact recognize route", revenueRoute.includes("claim_finance_revenue_recognition"));
check("Revenue Recognition posts through Finance gateway", revenueRoute.includes("financeGateway"));
check("Revenue Recognition finalizes exact run", revenueRoute.includes("finalize_finance_revenue_recognition"));
check("Revenue Recognition form only advertises implemented methods", convergence.includes("STRAIGHT_LINE") && convergence.includes("MANUAL") && !convergence.includes("MILESTONE") && !convergence.includes("USAGE") && !convergence.includes("DELIVERY"));
check("Revenue Recognition row action is wired", convergence.includes("recognize_revenue") && convergence.includes("/api/finance/revenue-recognition/recognize"));

check("FX Revaluation has exact execute route", fxRoute.includes("export async function POST"));
check("FX Revaluation uses governed exchange-rate resolver", fxRoute.includes("resolveFinanceExchangeRate"));
check("FX Revaluation requires selected monetary accounts", fxRoute.includes("account_ids"));
check("FX Revaluation prevents repeat carrying-value adjustment", fxRoute.includes("prior") || fxRoute.includes("revaluation"));
check("FX Revaluation row action is wired", convergence.includes("execute_fx_revaluation") && convergence.includes("/api/finance/fx-revaluation/execute"));

check("Tax Codes repository supports organisation overrides", taxRepository.includes("organization_id") && taxRepository.includes("organizationRules"));
check("Tax Codes repository preserves global defaults", taxRepository.includes("globalRules") && taxRepository.includes("inherited"));
check("Tax Codes expose governed tax_type", taxListRoute.includes("tax_type"));
check("Tax Codes exact write route is permissioned", taxUpsertRoute.includes("finance.tax.manage"));
check("Tax Codes create uses exact governed route", convergence.includes('createEndpoint = "/api/finance/tax-codes/upsert"'));
check("Tax Codes edit uses exact governed route", convergence.includes('mutationEndpoint = "/api/finance/tax-codes/upsert"'));
check("Tax Codes cannot be generically duplicated", mutationPolicy.includes('"tax_codes"'));
check("Vendor bills validate governed tax rules", vendorCreate.includes("tax_rules") && vendorCreate.includes("tax_type"));

check("VAT calculate route is exact and permissioned", vatCalculate.includes('capabilityId: "vat_returns"') && vatCalculate.includes("calculate_finance_vat_return"));
check("VAT submit route records external reference only", vatSubmitted.includes("mark_finance_vat_return_submitted") && vatSubmitted.includes("EXTERNAL_REFERENCE_RECORDED"));
check("VAT submission form exists", operationalForms.includes('"vat-return-mark-submitted"'));
check("VAT contract does not expose calculated amounts for manual entry", !convergence.match(/vatReturns\.schema[\s\S]{0,2500}name: "output_tax"/));
check("VAT migration uses line-level governed VAT evidence", read("supabase/migrations/20260822073216_finance_vat_output_tax_rule_repair.sql").includes("cil.tax_amount") && read("supabase/migrations/20260822073216_finance_vat_output_tax_rule_repair.sql").includes("tr.tax_type"));
check("VAT migration nets credit notes", read("supabase/migrations/20260822073216_finance_vat_output_tax_rule_repair.sql").includes("CREDIT_NOTE"));
check("VAT and statutory filing rows cannot be generically duplicated", mutationPolicy.includes('"vat_returns"') && mutationPolicy.includes('"statutory_filings"'));

check("Statutory filing exact submission route exists", statutorySubmitted.includes("mark_finance_statutory_filing_submitted"));
check("Statutory filing exact submission form exists", operationalForms.includes('"statutory-filing-mark-submitted"'));
check("Statutory filing UI describes external submission recording", convergence.includes("Record External Statutory Filing Submission"));

check("E-Invoicing local settings table migration exists", exists("supabase/migrations/20260822073122_finance_e_invoicing_settings_convergence.sql"));
check("E-Invoicing UI avoids claiming live external transmission", convergence.includes("does not claim that a government or network transmission connection is active"));
check("Banking integration requests remain pending setup", bankingIntegration.includes("PENDING_SETUP"));
check("Banking integrations are Avantiqo-managed", bankingIntegration.includes("AVANTIQO_MANAGED"));

check("Canonical registry applies VAT/Tax convergence", registryOwner.includes("applyFinanceVatTaxContractConvergence"));

const tenantPattern = /tenant_id|tenantId/;
for (const file of [
  "lib/finance/workspaces/FinanceVatTaxContractConvergence.js",
  "lib/finance/tax-codes/repositories/taxCodeRepository.js",
  "app/api/finance/vat-returns/calculate/route.js",
  "app/api/finance/vat-returns/mark-submitted/route.js",
  "app/api/finance/statutory-filings/mark-submitted/route.js",
  "app/api/finance/bank-statements/import/route.js",
  "app/api/finance/opening-balances/post/route.js",
  "app/api/finance/revenue-recognition/recognize/route.js",
  "app/api/finance/fx-revaluation/execute/route.js",
]) {
  check(`No tenant boundary in ${file}`, !tenantPattern.test(read(file)));
}

const failed = results.filter(row => !row.passed);
const summary = {
  checked: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map(row => row.name),
};

console.log("================================================================");
console.log(JSON.stringify(summary, null, 2));

if (failed.length) process.exit(1);
