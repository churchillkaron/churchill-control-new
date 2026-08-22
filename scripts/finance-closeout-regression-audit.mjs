#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const results = [];
const check = (name, ok) => {
  results.push({ name, passed: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
};
const has = (file, ...terms) => terms.every(term => read(file).includes(term));

const serializer = "lib/platform/registry/serializeCapability.js";
const config = "lib/finance/workspaces/FinanceConfigurationContractConvergence.js";
const taxVat = "lib/finance/workspaces/FinanceVatTaxContractConvergence.js";
const mutation = "lib/finance/workspaces/FinanceWorkspaceMutationPolicy.js";
const forms = "lib/platform/forms/FinanceOperationalFormContract.js";
const vercel = "vercel.json";
const manifest = "lib/finance/runtime/financeCapabilityRuntimeManifest.json";
const periodLifecycle = "lib/finance/period-close/capabilities/PeriodLifecycle.js";

for (const name of [
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
]) check(`migration ${name}`, exists(`supabase/migrations/${name}`));

check("serializer explicit create route", has(serializer, "contract.createEndpoint"));
check("serializer explicit mutation route", has(serializer, "contract.mutationEndpoint"));
check("serializer selected row actions", has(serializer, "contract.rowActions"));
check("bank import atomic POST", has("app/api/finance/bank-statements/import/route.js", "export async function POST", "create_finance_bank_statement_import", "requireOrganizationAccess"));
check("bank fake source URL removed", !read(config).includes("source_file_url"));

for (const file of [
  "app/api/finance/cash-flow/route.js",
  "app/api/finance/currencies/route.js",
  "app/api/finance/currencies/upsert/route.js",
  "app/api/finance/currencies/toggle/route.js",
]) {
  const source = read(file);
  check(`${file} permissioned`, source.includes("checkFinancePermission") || source.includes("requireFinanceWorkspacePermission"));
}

check("fiscal period request-aware", has("app/api/finance/periods/open/route.js", "request,", "finance.close.execute", "createdBy: actorId"));
check("fiscal period overlap entity scoped", has(periodLifecycle, "entity_id") && /overlap/i.test(read(periodLifecycle)));
check("opening balance canonical post", has("app/api/finance/opening-balances/post/route.js", "export async function POST", "financeGateway", "journal_entry_id"));

check("recurring atomic workflow", has("lib/finance/recurring-journals/RecurringJournalService.js", "processDueRecurringJournals", "claim_finance_recurring_journal_run", "finalize_finance_recurring_journal_run", "financeGateway"));
check("recurring cron protected", has("app/api/internal/finance/recurring-journals/process/route.js", "CRON_SECRET", "Bearer"));
check("recurring cron configured", has(vercel, "/api/internal/finance/recurring-journals/process", "0 * * * *"));
check("scheduled report cron retained", has(vercel, "/api/internal/finance/scheduled-reports/process"));

check("revenue recognition atomic post", has("app/api/finance/revenue-recognition/recognize/route.js", "claim_finance_revenue_recognition", "finalize_finance_revenue_recognition", "financeGateway"));
check("revenue methods truthful", has(config, "STRAIGHT_LINE", "MANUAL", "recognize_revenue", "/api/finance/revenue-recognition/recognize") && !/recognition_method[\s\S]{0,700}MILESTONE/.test(read(config)));

const fx = read("app/api/finance/fx-revaluation/execute/route.js");
check("FX governed execution", fx.includes("export async function POST") && fx.includes("resolveFinanceExchangeRate") && fx.includes("financeGateway") && (fx.includes("account_ids") || fx.includes("accountIds")));
check("FX row action", has(config, "execute_fx_revaluation", "/api/finance/fx-revaluation/execute"));

check("tax rules org/global model", has("lib/finance/tax-codes/repositories/taxCodeRepository.js", "organizationRules", "globalRules", "inherited", "tax_type"));
check("tax list exposes type", has("app/api/finance/tax-codes/route.js", "tax_type", "inherited"));
check("tax write permissioned", has("app/api/finance/tax-codes/upsert/route.js", "finance.tax.manage"));
check("tax exact mutation routes", has(taxVat, 'createEndpoint = "/api/finance/tax-codes/upsert"', 'mutationEndpoint = "/api/finance/tax-codes/upsert"'));
check("tax duplicate/archive blocked", has(mutation, '"tax_codes"'));
check("vendor tax governed", has("lib/finance/accounts-payable/documents/createVendorInvoice.js", "validateTaxRules", "tax_code_id required when tax_amount is positive", "expectedTax", "tax amount does not match"));

check("VAT exact calculate route", has("app/api/finance/vat-returns/calculate/route.js", 'capabilityId: "vat_returns"', "calculate_finance_vat_return"));
check("VAT external submit route", has("app/api/finance/vat-returns/mark-submitted/route.js", "mark_finance_vat_return_submitted", "EXTERNAL_REFERENCE_RECORDED"));
check("VAT submit form", has(forms, '"vat-return-mark-submitted"'));
const vatMigration = "supabase/migrations/20260822073216_finance_vat_output_tax_rule_repair.sql";
check("VAT line-level VAT-only evidence", has(vatMigration, "cil.tax_amount", "cil.tax_rule_id", "tr.tax_type", "'VAT'"));
check("VAT nets credit notes", has(vatMigration, "CREDIT_NOTE"));
check("VAT input requires posted approved vendor evidence", has(vatMigration, "APPROVED", "POSTED", "vi.journal_entry_id is not null"));

check("statutory external submit route", has("app/api/finance/statutory-filings/mark-submitted/route.js", "mark_finance_statutory_filing_submitted", "EXTERNAL_REFERENCE_RECORDED"));
check("statutory submit form", has(forms, '"statutory-filing-mark-submitted"'));
check("filing duplicate/archive blocked", has(mutation, '"vat_returns"', '"statutory_filings"'));

check("e-invoice source table exists", exists("supabase/migrations/20260822073122_finance_e_invoicing_settings_convergence.sql"));
check("e-invoice avoids fake transmission claim", has(taxVat, "does not claim that a government or network transmission connection is active"));
check("bank integration truthful pending setup", has("app/api/finance/banking-integrations/route.js", "PENDING_SETUP", "AVANTIQO_MANAGED", "credential_reference: null"));
check("bank integration exact create contract", has(taxVat, 'bankingIntegrations.createEndpoint = "/api/finance/banking-integrations"'));
check("bank integration sanitized list binding", has(manifest, '"banking_integrations"', '"api": "/api/finance/banking-integrations"'));
check("government connection governed request", has("app/api/finance/government-connections/route.js", "finance.tax.manage", "PENDING_SETUP", "PENDING_CONFIGURATION", "credential_reference: null"));
check("government connection sanitized GET", !read("app/api/finance/government-connections/route.js").match(/\.select\([^\n]*credential_reference/));
check("government connection exact create contract", has(taxVat, 'governmentConnections.createEndpoint = "/api/finance/government-connections"'));
check("government connection sanitized list binding", has(manifest, '"government_connections"', '"api": "/api/finance/government-connections"'));
check("canonical registry applies tax/VAT convergence", has("lib/platform/registry/erpRegistry.js", "applyFinanceVatTaxContractConvergence"));

const tenant = /tenant_id|tenantId/;
for (const file of [taxVat, "lib/finance/tax-codes/repositories/taxCodeRepository.js", "app/api/finance/vat-returns/calculate/route.js", "app/api/finance/vat-returns/mark-submitted/route.js", "app/api/finance/statutory-filings/mark-submitted/route.js", "app/api/finance/government-connections/route.js", "app/api/finance/banking-integrations/route.js", "app/api/finance/bank-statements/import/route.js", "app/api/finance/opening-balances/post/route.js", "app/api/finance/revenue-recognition/recognize/route.js", "app/api/finance/fx-revaluation/execute/route.js"]) {
  check(`no tenant boundary ${file}`, !tenant.test(read(file)));
}

const failed = results.filter(row => !row.passed);
console.log("================================================================");
console.log(JSON.stringify({ checked: results.length, passed: results.length - failed.length, failed: failed.length, failures: failed.map(row => row.name) }, null, 2));
if (failed.length) process.exit(1);
