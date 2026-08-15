import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  peopleBoundary: "lib/people/payroll/index.js",
  governanceApi: "app/api/payroll/governance/route.js",
  previewApi: "app/api/payroll/preview/route.js",
  generateApi: "app/api/payroll/generate/route.js",
  readinessApi: "app/api/payroll/readiness/route.js",
  paymentsApi: "app/api/payroll/payments/route.js",
  payslipApi: "app/api/payroll/payslip/route.js",
  acknowledgeApi: "app/api/staff/payroll/acknowledge/route.js",
  disputeApi: "app/api/staff/payroll/dispute/route.js",
  countryLoader: "lib/payroll/countries/loadPayrollCountryPack.js",
  jurisdiction: "lib/payroll/countries/resolvePayrollJurisdiction.js",
  payrollRecords: "lib/payroll/generatePayrollRecords.js",
  readiness: "lib/payroll/readiness/buildPayrollReadiness.js",
  accrual: "lib/payroll/accounting/postPayrollAccrual.js",
  settlement: "lib/payroll/payments/reconcilePayrollPaymentBatch.js",
  financeEvidence: "lib/payroll/accounting/verifyPayrollFinanceEvidence.js",
  finalizer: "lib/payroll/consolidation/finalizePayrollRecord.js",
  accountingClose: "lib/payroll/consolidation/closePayrollAccountingPeriod.js",
  certifier: "lib/payroll/consolidation/certifyPayrollRecord.js",
  archiver: "lib/payroll/consolidation/archivePayrollRecord.js",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing People/Payroll terminal release file: ${relativePath}`);
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} is missing a required terminal payroll contract`);
  }
}

function requireNoMatch(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`${label} contains a forbidden terminal payroll contract`);
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
);

for (const [label, file] of [
  ["Payroll governance API", source.governanceApi],
  ["Payroll preview API", source.previewApi],
  ["Payroll generation API", source.generateApi],
  ["Payroll readiness API", source.readinessApi],
  ["Payroll payments API", source.paymentsApi],
  ["Payroll payslip API", source.payslipApi],
  ["Staff payroll acknowledgement API", source.acknowledgeApi],
  ["Staff payroll dispute API", source.disputeApi],
]) {
  requireMatch(
    file,
    /@\/lib\/people\/payroll/,
    `${label} People payroll application boundary`
  );
  requireNoMatch(
    file,
    /@\/lib\/payroll\//,
    `${label} direct payroll engine bypass`
  );
}

requireMatch(
  source.peopleBoundary,
  /generateMonthlyPayroll[\s\S]*buildPayrollReadiness[\s\S]*preparePayrollPaymentBatch[\s\S]*reconcilePayrollPaymentBatch/,
  "People payroll application boundary"
);

requireMatch(
  source.countryLoader,
  /normalizePayrollCountry[\s\S]*supportsPayrollCountry[\s\S]*throw new Error/,
  "Payroll explicit jurisdiction support"
);
requireNoMatch(
  source.countryLoader,
  /country\s*=\s*["']Thailand["']|\|\|\s*ThailandPayrollPack/,
  "Payroll implicit Thailand jurisdiction fallback"
);
requireMatch(
  source.jurisdiction,
  /\.from\("legal_entities"\)[\s\S]*?\.eq\("id", entityId\)[\s\S]*?\.eq\("organization_id", organizationId\)/,
  "Payroll legal-entity jurisdiction scope"
);
requireMatch(
  source.jurisdiction,
  /country[\s\S]*currency[\s\S]*supportsPayrollCountry/,
  "Payroll legal-entity country and currency contract"
);
requireMatch(
  source.payrollRecords,
  /resolvePayrollJurisdiction[\s\S]*jurisdiction\.currency[\s\S]*loadPayrollCountryPack\(jurisdiction\.country\)/,
  "Payroll calculation legal-entity jurisdiction"
);
requireNoMatch(
  source.payrollRecords,
  /profile\.payroll_country\s*\|\|\s*payrollSettings\?\.country/,
  "Payroll duplicate operational jurisdiction fallback"
);

requireMatch(
  source.readiness,
  /resolvePayrollJurisdiction/,
  "Payroll readiness legal-entity jurisdiction"
);
requireMatch(
  source.readiness,
  /COMPENSATION_AMOUNT_MISSING[\s\S]*COMPENSATION_CURRENCY_MISMATCH/,
  "Payroll readiness compensation controls"
);
requireMatch(
  source.readiness,
  /BANK_DETAILS_MISSING[\s\S]*ACCOUNTING_PERIOD_NOT_OPEN[\s\S]*PAYROLL_POSTING_RULES_MISSING/,
  "Payroll lifecycle readiness payment and Finance controls"
);
requireMatch(
  source.readiness,
  /PAYROLL_NET[\s\S]*PAYROLL_TAX[\s\S]*PAYROLL_SOCIAL_SECURITY[\s\S]*PAYROLL_DEDUCTION[\s\S]*PAYROLL_SETTLEMENT/,
  "Payroll lifecycle readiness Finance event coverage"
);
requireMatch(
  source.readiness,
  /canCompleteLifecycle:\s*blockers\.length === 0 && lifecycleBlockers\.length === 0/,
  "Payroll end-to-end lifecycle readiness result"
);

for (const [label, file] of [
  ["Payroll accrual", source.accrual],
  ["Payroll settlement", source.settlement],
]) {
  requireMatch(
    file,
    /resolveFinanceExchangeRate/,
    `${label} Finance currency policy`
  );
  requireNoMatch(
    file,
    /exchange_rate:\s*1\b/,
    `${label} hardcoded exchange rate`
  );
}

requireNoMatch(
  source.accrual,
  /account_code["']?\s*[,=:]\s*["']6010["']|\.eq\(\s*["']account_code["']\s*,\s*["']6010["']\s*\)/,
  "Payroll accrual hardcoded account fallback"
);

requireMatch(
  source.settlement,
  /const financeResult = await financeGateway\([\s\S]*?PAYROLL_SETTLEMENT/,
  "Payroll settlement Finance posting"
);
requireMatch(
  source.settlement,
  /settlementJournalEntryId[\s\S]*?financeResult\?\.journal\?\.id[\s\S]*?financeResult\?\.ledger\?\.journalEntryId/,
  "Payroll settlement journal identity"
);
requireMatch(
  source.settlement,
  /settlement_journal_entry_id:\s*settlementJournalEntryId/,
  "Payroll settlement journal persistence"
);

requireMatch(
  source.financeEvidence,
  /\.from\("payroll_payments"\)[\s\S]*?\.eq\("status",\s*"PAID"\)/,
  "Payroll Finance evidence paid batch"
);
requireMatch(
  source.financeEvidence,
  /\.from\("payroll_payouts"\)/,
  "Payroll Finance evidence payout coverage"
);
requireMatch(
  source.financeEvidence,
  /source_document[\s\S]*?PAYROLL_SETTLEMENT[\s\S]*?source_document_id/,
  "Payroll Finance evidence settlement journal"
);
requireMatch(
  source.financeEvidence,
  /PAYROLL_NET[\s\S]*PAYROLL_TAX[\s\S]*PAYROLL_SOCIAL_SECURITY[\s\S]*PAYROLL_DEDUCTION/,
  "Payroll Finance evidence accrual components"
);
requireMatch(
  source.financeEvidence,
  /journal_entry_lines/,
  "Payroll Finance evidence journal amount verification"
);
requireMatch(
  source.financeEvidence,
  /reversed !== true[\s\S]*?!journal\.reversal_journal_id/,
  "Payroll Finance evidence reversal protection"
);

for (const [label, file] of [
  ["Payroll finalization", source.finalizer],
  ["Payroll accounting close", source.accountingClose],
  ["Payroll certification", source.certifier],
  ["Payroll archive", source.archiver],
]) {
  requireMatch(
    file,
    /verifyPayrollFinanceEvidence/,
    `${label} Finance evidence gate`
  );
  requireMatch(
    file,
    /organizationId[\s\S]*entityId:[\s\S]*payrollMonth:[\s\S]*records:\s*monthRecords/,
    `${label} organization/entity/month evidence scope`
  );
}

console.log(
  "People/Payroll terminal release audit passed: People application boundary, explicit legal-entity jurisdiction, no implicit Thailand fallback, generation and lifecycle readiness, Finance currency policy, durable settlement journal identity, complete paid-batch evidence, active posted accrual and settlement journals, reversal protection, and Finance-evidence gates for finalization through archive are intact."
);
