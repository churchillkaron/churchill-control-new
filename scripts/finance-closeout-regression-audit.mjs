#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = relative => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = relative => fs.existsSync(path.join(ROOT, relative));
const rows = [];
const check = (name, passed) => {
  rows.push({ name, passed: Boolean(passed) });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
};

const serializer = read("lib/platform/registry/serializeCapability.js");
const config = read("lib/finance/workspaces/FinanceConfigurationContractConvergence.js");
const taxVat = read("lib/finance/workspaces/FinanceVatTaxContractConvergence.js");
const mutation = read("lib/finance/workspaces/FinanceWorkspaceMutationPolicy.js");
const forms = read("lib/platform/forms/FinanceOperationalFormContract.js");
const vercel = read("vercel.json");
const bankImport = read("app/api/finance/bank-statements/import/route.js");
const fiscalOpen = read("app/api/finance/periods/open/route.js");
const periodLifecycle = read("lib/finance/fiscal-periods/PeriodLifecycle.js");
const openingPost = read("app/api/finance/opening-balances/post/route.js");
const recurring = read("lib/finance/recurring-journals/RecurringJournalService.js");
const recurringCron = read("app/api/internal/finance/recurring-journals/process/route.js");
const revenue = read("app/api/finance/revenue-recognition/recognize/route.js");
const fx = read("app/api/finance/fx-revaluation/execute/route.js");
const taxRepo = read("lib/finance/tax-codes/repositories/taxCodeRepository.js");
const taxList = read("app/api/finance/tax-codes/route.js");
const taxWrite = read("app/api/finance/tax-codes/upsert/route.js");
const vendorCreate = read("lib/finance/accounts-payable/documents/createVendorInvoice.js");
const vatCalc = read("app/api/finance/vat-returns/calculate/route.js");
const vatSubmit = read("app/api/finance/vat-returns/mark-submitted/route.js");
const statutorySubmit = read("app/api/finance/statutory-filings/mark-submitted/route.js");
const banking = read("app/api/finance/banking-integrations/route.js");
const registry = read("lib/platform/registry/erpRegistry.js");

const requiredMigrations = [
  "20260822061914_finance_bank_statement_atomic_import_convergence.sql",
  "20260822063037_finance_opening_balance_posting_lineage.sql",
  "20260822063047_finance_opening_balance_exchange_rate.sql",
  "20260822063523_finance_recurring_journal_execution_convergence.sql",
  "20260822063609_finance_recurring_journal_finalize_timezone.sql",
  "20260822063721_finance_recurring_journal_template_validation.sql",
  "20260822063827_finance_recurring_journal_account_validation_repair.sql",
  "20260822064038_finance_revenue_recognition_execution_convergence.sql",
  "20260822064447_finance_fx_revaluation_execution_convergence.sql",
  "20260822065825_finance_tax_rule_organization_scope_convergence.sql",
  "20260822070402_finance_tax_rule_type_convergence.sql",
  "20260822070639_finance_vat_return_execution_convergence.sql",
  "20260822073122_finance_e_invoicing_settings_convergence.sql",
  "20260822073216_finance_vat_output_tax_rule_repair.sql",
  "20260822073246_finance_statutory_filing_lifecycle_convergence.sql",
];
for (const name of requiredMigrations) {
  check(`migration ${name}`, exists(`supabase/migrations/${name}`));
}

check("serializer explicit create route", serializer.includes("contract.createEndpoint"));
check("serializer explicit mutation route", serializer.includes("contract.mutationEndpoint"));
check("serializer selected-record rowActions", serializer.includes("contract.rowActions"));
check("serializer does not force reconciliation PUT", !/reconciliation[\s\S]{0,300}method:\s*["']PUT["']/.test(serializer));

check("bank import exact POST", bankImport.includes("export async function POST"));
check("bank import atomic RPC", bankImport.includes("create_finance_bank_statement_import"));
check("bank import permissioned", bankImport.includes("requireFinanceWorkspacePermission") || bankImport.includes("checkFinancePermission"));
check("bank statement fake source URL removed", !config.includes("source_file_url"));

for (const route of [
  "app/api/finance/cash-flow/route.js",
  "app/api/finance/currencies/route.js",
  "app/api/finance/currencies/upsert/route.js",
  "app/api/finance/currencies/toggle/route.js",
]) {
  const source = read(route);
  check(`${route} permissioned`, source.includes("checkFinancePermission") || source.includes("requireFinanceWorkspacePermission"));
}

check("fiscal period request-aware access", fiscalOpen.includes("request,"));
check("fiscal period close permission", fiscalOpen.includes("finance.close.execute"));
check("fiscal period actor derived from auth", fiscalOpen.includes("access.user") && !fiscalOpen.includes("createdBy: body.createdBy"));
check("fiscal period overlap entity scoped", periodLifecycle.includes("entity_id") && /overlap/i.test(periodLifecycle));

check("opening balance exact post", openingPost.includes("export async function POST"));
check("opening balance canonical gateway", openingPost.includes("financeGateway"));
check("opening balance journal lineage", openingPost.includes("journal_entry_id"));
check("opening balance generic mutations blocked", mutation.includes('"opening_balances"'));

check("recurring journal due processor", recurring.includes("processDueRecurringJournals"));
check("recurring journal atomic claim", recurring.includes("claim_finance_recurring_journal_run"));
check("recurring journal atomic finalize", recurring.includes("finalize_finance_recurring_journal_run"));
check("recurring journal canonical posting", recurring.includes("financeGateway"));
check("recurring cron protected", recurringCron.includes("CRON_SECRET") && recurringCron.includes("Bearer"));
check("recurring hourly cron configured", vercel.includes("/api/internal/finance/recurring-journals/process") && vercel.includes("0 * * * *"));
check("scheduled-report cron retained", vercel.includes("/api/internal/finance/scheduled-reports/process"));

check("revenue exact claim", revenue.includes("claim_finance_revenue_recognition"));
check("revenue exact finalize", revenue.includes("finalize_finance_revenue_recognition"));
check("revenue canonical posting", revenue.includes("financeGateway"));
check("revenue methods truthful", config.includes("STRAIGHT_LINE") && config.includes("MANUAL") && !/recognition_method[\s\S]{0,700}MILESTONE/.test(config));
check("revenue row action", config.includes("recognize_revenue") && config.includes("/api/finance/revenue-recognition/recognize"));

check("FX exact POST", fx.includes("export async function POST"));
check("FX governed rate", fx.includes("resolveFinanceExchangeRate"));
check("FX selected accounts", fx.includes("account_ids") || fx.includes("accountIds"));
check("FX canonical posting", fx.includes("financeGateway"));
check("FX row action", config.includes("execute_fx_revaluation") && config.includes("/api/finance/fx-revaluation/execute"));

check("tax repository organization overrides", taxRepo.includes("organizationRules") && taxRepo.includes("organization_id"));
check("tax repository global defaults", taxRepo.includes("globalRules") && taxRepo.includes("inherited"));
check("tax list exposes tax type", taxList.includes("tax_type"));
check("tax write permissioned", taxWrite.includes("finance.tax.manage"));
check("tax create exact route", taxVat.includes('createEndpoint = "/api/finance/tax-codes/upsert"'));
check("tax edit exact route", taxVat.includes('mutationEndpoint = "/api/finance/tax-codes/upsert"'));
check("tax generic duplicate/archive blocked", mutation.includes('"tax_codes"'));
check("vendor tax rule validation", vendorCreate.includes("validateTaxRules") && vendorCreate.includes("tax_code_id required when tax_amount is positive"));
check("vendor tax amount matches governed rate", vendorCreate.includes("expectedTax") && vendorCreate.includes("tax amount does not match"));

check("VAT exact calculation RPC route", vatCalc.includes("calculate_finance_vat_return") && vatCalc.includes('capabilityId: "vat_returns"'));
check("VAT external-reference submit route", vatSubmit.includes("mark_finance_vat_return_submitted") && vatSubmit.includes("EXTERNAL_REFERENCE_RECORDED"));
check("VAT external-reference form", forms.includes('"vat-return-mark-submitted"'));
check("VAT calculated amounts absent from input schema", !/vatReturns\.schema[\s\S]{0,2200}name:\s*["']output_tax["']/.test(taxVat));
const vatMigration = read("supabase/migrations/20260822073216_finance_vat_output_tax_rule_repair.sql");
check("VAT line-level output evidence", vatMigration.includes("cil.tax_amount") && vatMigration.includes("cil.tax_rule_id"));
check("VAT governed VAT-only rules", vatMigration.includes("tr.tax_type") && vatMigration.includes("'VAT'"));
check("VAT credit notes net output tax", vatMigration.includes("CREDIT_NOTE"));
check("VAT input requires approved posted bills", vatMigration.includes("APPROVED") && vatMigration.includes("POSTED") && vatMigration.includes("vi.journal_entry_id is not null"));

check("statutory exact submit RPC route", statutorySubmit.includes("mark_finance_statutory_filing_submitted"));
check("statutory external-reference form", forms.includes('"statutory-filing-mark-submitted"'));
check("statutory UI truthfully records external filing", taxVat.includes("Record External Statutory Filing Submission"));
check("filing duplicate/archive blocked", mutation.includes('"vat_returns"') && mutation.includes('"statutory_filings"'));

check("e-invoicing settings table source", exists("supabase/migrations/20260822073122_finance_e_invoicing_settings_convergence.sql"));
check("e-invoicing avoids fake transmission claim", taxVat.includes("does not claim that a government or network transmission connection is active"));
check("bank integration remains pending setup", banking.includes("PENDING_SETUP"));
check("bank integration Avantiqo managed", banking.includes("AVANTIQO_MANAGED"));
check("canonical registry applies tax/VAT convergence", registry.includes("applyFinanceVatTaxContractConvergence"));

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
  check(`no tenant boundary ${file}`, !tenantPattern.test(read(file)));
}

const failed = rows.filter(row => !row.passed);
console.log("================================================================");
console.log(JSON.stringify({ checked: rows.length, passed: rows.length - failed.length, failed: failed.length, failures: failed.map(row => row.name) }, null, 2));
if (failed.length) process.exit(1);
