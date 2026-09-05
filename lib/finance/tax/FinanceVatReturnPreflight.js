import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PAGE_SIZE = 1000;
const MAX_PREFLIGHT_ROWS = 250000;
const EVIDENCE_PREVIEW_LIMIT = 250;
const MONEY_TOLERANCE = 0.005;

function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function numeric(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function roundMoney(value) { return Math.round((numeric(value) + Number.EPSILON) * 100) / 100; }
function nonZero(value) { return Math.abs(numeric(value)) > 0.0000001; }
function beforeOrEqual(left, right) { return !left || !right || String(left) <= String(right); }
function afterOrEqual(left, right) { return !left || !right || String(left) >= String(right); }

function changedAfter(row, timestamp) {
  if (!timestamp) return false;
  const boundary = new Date(timestamp).getTime();
  if (!Number.isFinite(boundary)) return false;
  return [row?.created_at, row?.updated_at, row?.posted_at, row?.approved_at]
    .filter(Boolean)
    .some(value => {
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) && parsed > boundary;
    });
}

function currencyOf(row) { return upper(row?.currency_code || row?.currency); }
function exchangeRate(row) { const rate = Number(row?.exchange_rate); return Number.isFinite(rate) && rate !== 0 ? rate : 1; }
function needsExchangeRate(row, functionalCurrency) {
  const currency = currencyOf(row);
  if (!currency || !functionalCurrency || currency === functionalCurrency) return false;
  const rate = Number(row?.exchange_rate);
  return !Number.isFinite(rate) || rate === 0;
}
function referenceOf(row, fallback) { return text(row?.invoice_number || row?.return_number || row?.reference || row?.document_number || fallback); }

function check({ code, label, status, detail, count = 0, blocksCalculation = false, blocksSubmission = false }) {
  return { code, label, status, detail, count, blocks_calculation: blocksCalculation, blocks_submission: blocksSubmission };
}

function exception({ code, severity = "BLOCK", sourceType = "CONFIG", sourceId = null, reference = null, date = null, detail, amount = null }) {
  return { code, severity, source_type: sourceType, source_id: sourceId, reference, date, detail, amount };
}

async function fetchPaged(makeQuery, label) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (rows.length > MAX_PREFLIGHT_ROWS) throw new Error(`${label} exceeds the ${MAX_PREFLIGHT_ROWS.toLocaleString("en-US")} row interactive preflight limit`);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function chunks(values, size = 250) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchByIds({ table, column, ids, apply, label }) {
  if (!ids.length) return [];
  const rows = [];
  for (const group of chunks(ids)) {
    const pageRows = await fetchPaged(() => {
      let query = supabaseAdmin.from(table).select("*").in(column, group);
      if (apply) query = apply(query);
      return query;
    }, label);
    rows.push(...pageRows);
    if (rows.length > MAX_PREFLIGHT_ROWS) throw new Error(`${label} exceeds the ${MAX_PREFLIGHT_ROWS.toLocaleString("en-US")} row interactive preflight limit`);
  }
  return rows;
}

function ruleEffectiveForInvoice(rule, invoiceDate) {
  if (rule?.is_active !== true) return false;
  if (!beforeOrEqual(rule?.effective_from, invoiceDate)) return false;
  if (!afterOrEqual(rule?.effective_to, invoiceDate)) return false;
  return true;
}

function ruleOverlapsPeriod(rule, periodStart, periodEnd) {
  if (rule?.is_active !== true) return false;
  if (rule?.effective_from && periodEnd && String(rule.effective_from) > String(periodEnd)) return false;
  if (rule?.effective_to && periodStart && String(rule.effective_to) < String(periodStart)) return false;
  return true;
}

async function loadContext({ organizationId, entityId }) {
  const [{ data: entity, error: entityError }, { data: profiles, error: profileError }, rules] = await Promise.all([
    supabaseAdmin.from("legal_entities").select("*").eq("organization_id", organizationId).eq("id", entityId).maybeSingle(),
    supabaseAdmin.from("finance_organization_profiles").select("*").eq("organization_id", organizationId),
    fetchPaged(() => supabaseAdmin.from("tax_rules").select("*").or(`organization_id.eq.${organizationId},organization_id.is.null`).order("tax_name", { ascending: true }), "Tax rule evidence"),
  ]);
  if (entityError) throw new Error(entityError.message);
  if (!entity) throw new Error("Legal entity not found in organization scope");
  if (profileError) throw new Error(profileError.message);

  const profileRows = profiles || [];
  const profile = profileRows.find(row => row.entity_id === entityId) || profileRows.find(row => !row.entity_id) || null;
  const functionalCurrency = upper(profile?.functional_currency || profile?.base_currency || entity?.currency || "THB");
  const registrationReference = text(profile?.tax_registration_number || profile?.tax_number || entity?.tax_id);
  return { entity, profile, rules, functionalCurrency, registrationReference };
}

export async function loadFinanceTaxWorkspaceSetup({ organizationId, entityId }) {
  if (!organizationId) throw new Error("organization_id required");
  if (!entityId) throw new Error("entity_id required");
  const context = await loadContext({ organizationId, entityId });
  const vatRules = context.rules.filter(rule => upper(rule.tax_type) === "VAT" && rule.is_active === true);
  const regimes = [...new Set(vatRules.map(rule => upper(rule.tax_regime)).filter(Boolean))];
  const country = upper(context.profile?.country_code || context.entity?.country);
  const countryCandidates = country === "TH" || country === "THA" || country === "THAILAND" ? ["THAILAND", country] : [country];
  const countryRegime = countryCandidates.find(value => value && regimes.includes(value)) || null;

  return {
    entity: {
      id: context.entity.id,
      code: context.entity.code || null,
      legal_name: context.entity.legal_name || context.entity.display_name || null,
      country: context.entity.country || context.profile?.country_code || null,
      functional_currency: context.functionalCurrency,
    },
    registration_reference: context.registrationReference || null,
    suggested_jurisdiction: countryRegime || (regimes.length === 1 ? regimes[0] : null),
    vat_regimes: regimes,
    vat_rules: vatRules.map(rule => ({
      id: rule.id,
      tax_code: rule.tax_code,
      tax_name: rule.tax_name,
      tax_rate: rule.tax_rate,
      tax_regime: upper(rule.tax_regime),
      effective_from: rule.effective_from,
      effective_to: rule.effective_to,
      inherited: !rule.organization_id,
    })),
  };
}

export async function buildFinanceVatReturnPreflight({ organizationId, entityId, vatReturnId }) {
  if (!organizationId) throw new Error("organization_id required");
  if (!entityId) throw new Error("entity_id required");
  if (!vatReturnId) throw new Error("vat_return_id required");

  const [{ data: vatReturn, error: returnError }, context] = await Promise.all([
    supabaseAdmin.from("finance_vat_returns").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", vatReturnId).maybeSingle(),
    loadContext({ organizationId, entityId }),
  ]);
  if (returnError) throw new Error(returnError.message);
  if (!vatReturn) throw new Error("VAT return not found in organization and entity scope");

  const jurisdiction = upper(vatReturn.jurisdiction_code);
  const periodStart = vatReturn.period_start;
  const periodEnd = vatReturn.period_end;
  const status = upper(vatReturn.status || "DRAFT");
  const functionalCurrency = context.functionalCurrency;

  const [customerInvoices, vendorInvoices] = await Promise.all([
    fetchPaged(() => supabaseAdmin.from("customer_invoices").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).gte("invoice_date", periodStart).lte("invoice_date", periodEnd).order("invoice_date", { ascending: true }).order("id", { ascending: true }), "Customer VAT evidence"),
    fetchPaged(() => supabaseAdmin.from("vendor_invoices").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).gte("invoice_date", periodStart).lte("invoice_date", periodEnd).order("invoice_date", { ascending: true }).order("id", { ascending: true }), "Vendor VAT evidence"),
  ]);

  const customerIds = customerInvoices.map(row => row.id).filter(Boolean);
  const vendorIds = vendorInvoices.map(row => row.id).filter(Boolean);
  const vendorJournalIds = [...new Set(vendorInvoices.map(row => row.journal_entry_id).filter(Boolean))];
  const [journalEntries, vendorJournalEntries, customerLines, vendorLines] = await Promise.all([
    fetchByIds({
      table: "journal_entries",
      column: "source_document_id",
      ids: customerIds,
      apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("created_at", { ascending: true }),
      label: "Customer posting evidence",
    }),
    fetchByIds({
      table: "journal_entries",
      column: "id",
      ids: vendorJournalIds,
      apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("created_at", { ascending: true }),
      label: "Vendor posting evidence",
    }),
    fetchByIds({
      table: "customer_invoice_lines",
      column: "customer_invoice_id",
      ids: customerIds,
      apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("customer_invoice_id", { ascending: true }).order("created_at", { ascending: true }),
      label: "Customer VAT line evidence",
    }),
    fetchByIds({
      table: "vendor_invoice_lines",
      column: "vendor_invoice_id",
      ids: vendorIds,
      apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("vendor_invoice_id", { ascending: true }).order("line_number", { ascending: true }),
      label: "Vendor VAT line evidence",
    }),
  ]);

  const journalsBySource = new Map();
  for (const journal of journalEntries) {
    if (!journal.source_document_id) continue;
    const current = journalsBySource.get(journal.source_document_id) || [];
    current.push(journal);
    journalsBySource.set(journal.source_document_id, current);
  }
  const vendorJournalsById = new Map(vendorJournalEntries.map(row => [row.id, row]));

  const customerLinesByInvoice = new Map();
  for (const line of customerLines) {
    if (!line.customer_invoice_id) continue;
    const current = customerLinesByInvoice.get(line.customer_invoice_id) || [];
    current.push(line);
    customerLinesByInvoice.set(line.customer_invoice_id, current);
  }

  const vendorLinesByInvoice = new Map();
  for (const line of vendorLines) {
    if (!line.vendor_invoice_id) continue;
    const current = vendorLinesByInvoice.get(line.vendor_invoice_id) || [];
    current.push(line);
    vendorLinesByInvoice.set(line.vendor_invoice_id, current);
  }

  const rulesById = new Map(context.rules.map(rule => [rule.id, rule]));
  const periodVatRules = context.rules.filter(rule => upper(rule.tax_type) === "VAT" && upper(rule.tax_regime) === jurisdiction && ruleOverlapsPeriod(rule, periodStart, periodEnd));

  const exceptions = [];
  const outputEvidence = [];
  const relevantCustomerRows = [];
  const relevantCustomerLines = [];
  let outputTax = 0;
  let outputDocumentCount = 0;
  let customerCreditNoteCount = 0;
  let outputPostingIssues = 0;
  let outputRateIssues = 0;
  let outputCodingIssues = 0;

  for (const invoice of customerInvoices) {
    const lines = customerLinesByInvoice.get(invoice.id) || [];
    const reference = referenceOf(invoice, invoice.id);
    const invoiceDate = invoice.invoice_date;
    const missingRuleLines = lines.filter(line => nonZero(line.tax_amount) && !line.tax_rule_id);
    const unresolvedRuleLines = lines.filter(line => nonZero(line.tax_amount) && line.tax_rule_id && !rulesById.has(line.tax_rule_id));
    const jurisdictionVatLines = lines.filter(line => {
      const rule = rulesById.get(line.tax_rule_id);
      return rule && upper(rule.tax_type) === "VAT" && upper(rule.tax_regime) === jurisdiction && nonZero(line.tax_amount);
    });
    const ineligibleVatLines = jurisdictionVatLines.filter(line => !ruleEffectiveForInvoice(rulesById.get(line.tax_rule_id), invoiceDate));
    const eligibleVatLines = jurisdictionVatLines.filter(line => ruleEffectiveForInvoice(rulesById.get(line.tax_rule_id), invoiceDate));
    const eligibleTax = eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0);
    const journals = journalsBySource.get(invoice.id) || [];
    const postedJournals = journals.filter(row => upper(row.status) === "POSTED");
    const validPostedJournals = postedJournals.filter(row => row.reversed !== true);
    const enginePosted = validPostedJournals.length > 0;
    const validPosted = validPostedJournals.length > 0;
    const foreignRateMissing = eligibleVatLines.length > 0 && needsExchangeRate(invoice, functionalCurrency);

    if (missingRuleLines.length || unresolvedRuleLines.length || ineligibleVatLines.length) {
      outputCodingIssues += missingRuleLines.length + unresolvedRuleLines.length + ineligibleVatLines.length;
      for (const line of missingRuleLines) {
        exceptions.push(exception({
          code: "OUTPUT_TAX_CODE_MISSING",
          sourceType: "CUSTOMER_INVOICE",
          sourceId: invoice.id,
          reference,
          date: invoiceDate,
          detail: `Customer invoice line ${line.id} has tax but no governed tax rule.`,
          amount: line.tax_amount,
        }));
      }
      for (const line of unresolvedRuleLines) {
        exceptions.push(exception({
          code: "OUTPUT_TAX_CODE_UNRESOLVED",
          sourceType: "CUSTOMER_INVOICE",
          sourceId: invoice.id,
          reference,
          date: invoiceDate,
          detail: `Customer invoice line ${line.id} references a tax rule that is not available in this organisation.`,
          amount: line.tax_amount,
        }));
      }
      for (const line of ineligibleVatLines) {
        const rule = rulesById.get(line.tax_rule_id);
        exceptions.push(exception({
          code: "OUTPUT_VAT_RULE_NOT_EFFECTIVE",
          sourceType: "CUSTOMER_INVOICE",
          sourceId: invoice.id,
          reference,
          date: invoiceDate,
          detail: `${rule?.tax_code || "VAT code"} is inactive or outside its effective dates for this sales line.`,
          amount: line.tax_amount,
        }));
      }
    }

    if (eligibleVatLines.length || missingRuleLines.length || unresolvedRuleLines.length || ineligibleVatLines.length) {
      relevantCustomerRows.push(invoice);
      relevantCustomerLines.push(...eligibleVatLines, ...missingRuleLines, ...unresolvedRuleLines, ...ineligibleVatLines);
    }

    if (eligibleVatLines.length && enginePosted) {
      const sign = upper(invoice.document_type || "INVOICE") === "CREDIT_NOTE" ? -1 : 1;
      outputTax += sign * eligibleTax * exchangeRate(invoice);
      outputDocumentCount += 1;
      if (sign < 0) customerCreditNoteCount += 1;
    }

    if (eligibleVatLines.length && !validPosted) {
      outputPostingIssues += 1;
      exceptions.push(exception({
        code: postedJournals.length ? "OUTPUT_POSTING_REVERSED" : "OUTPUT_NOT_POSTED",
        sourceType: "CUSTOMER_INVOICE",
        sourceId: invoice.id,
        reference,
        date: invoiceDate,
        detail: postedJournals.length
          ? "The VAT-bearing sales document only has reversed posting evidence. Create a valid posting before calculating the return."
          : "VAT-bearing sales document is not backed by a posted journal entry.",
        amount: eligibleTax,
      }));
    }

    if (foreignRateMissing) {
      outputRateIssues += 1;
      exceptions.push(exception({
        code: "OUTPUT_EXCHANGE_RATE_MISSING",
        sourceType: "CUSTOMER_INVOICE",
        sourceId: invoice.id,
        reference,
        date: invoiceDate,
        detail: `Foreign-currency output VAT cannot use an implicit 1.0 rate against ${functionalCurrency}.`,
        amount: eligibleTax,
      }));
    }

    if (jurisdictionVatLines.length || missingRuleLines.length || unresolvedRuleLines.length) {
      const sign = upper(invoice.document_type || "INVOICE") === "CREDIT_NOTE" ? -1 : 1;
      outputEvidence.push({
        id: invoice.id,
        reference,
        date: invoiceDate,
        document_type: upper(invoice.document_type || "INVOICE"),
        currency_code: currencyOf(invoice) || functionalCurrency,
        tax_amount: roundMoney(eligibleTax),
        exchange_rate: invoice.exchange_rate,
        functional_tax_amount: enginePosted ? roundMoney(sign * eligibleTax * exchangeRate(invoice)) : 0,
        posted: validPosted,
        posted_journal_count: validPostedJournals.length,
        reversed_posting_only: postedJournals.length > 0 && !validPosted,
        vat_line_count: jurisdictionVatLines.length,
        eligible_vat_line_count: eligibleVatLines.length,
        source_updated_at: invoice.updated_at || invoice.created_at || null,
      });
    }
  }

  const inputEvidence = [];
  let inputTax = 0;
  let inputDocumentCount = 0;
  let inputCodingIssues = 0;
  let inputPostingIssues = 0;
  let inputRateIssues = 0;
  const relevantVendorRows = [];
  const relevantVendorLines = [];
  const relevantVendorJournals = [];

  for (const invoice of vendorInvoices) {
    const lines = vendorLinesByInvoice.get(invoice.id) || [];
    const reference = referenceOf(invoice, invoice.id);
    const invoiceDate = invoice.invoice_date;
    const missingCodeLines = lines.filter(line => nonZero(line.tax_amount) && !line.tax_code_id);
    const unresolvedCodeLines = lines.filter(line => nonZero(line.tax_amount) && line.tax_code_id && !rulesById.has(line.tax_code_id));
    const vatLines = lines.filter(line => {
      const rule = rulesById.get(line.tax_code_id);
      return rule && upper(rule.tax_type) === "VAT" && upper(rule.tax_regime) === jurisdiction && nonZero(line.tax_amount);
    });
    const ineligibleVatLines = vatLines.filter(line => !ruleEffectiveForInvoice(rulesById.get(line.tax_code_id), invoiceDate));
    const eligibleVatLines = vatLines.filter(line => ruleEffectiveForInvoice(rulesById.get(line.tax_code_id), invoiceDate));
    const linkedJournal = invoice.journal_entry_id ? vendorJournalsById.get(invoice.journal_entry_id) || null : null;
    const linkedJournalPosted = Boolean(linkedJournal && upper(linkedJournal.status) === "POSTED");
    const linkedJournalValid = linkedJournalPosted && linkedJournal.reversed !== true;
    const readyInvoice = upper(invoice.status) === "POSTED"
      && upper(invoice.approval_status) === "APPROVED"
      && Boolean(invoice.journal_entry_id)
      && linkedJournalValid;
    const foreignRateMissing = eligibleVatLines.length > 0 && needsExchangeRate(invoice, functionalCurrency);

    if (missingCodeLines.length || unresolvedCodeLines.length || ineligibleVatLines.length) {
      inputCodingIssues += missingCodeLines.length + unresolvedCodeLines.length + ineligibleVatLines.length;
      for (const line of missingCodeLines) exceptions.push(exception({ code: "INPUT_TAX_CODE_MISSING", sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference, date: invoiceDate, detail: `Vendor invoice line ${line.line_number ?? ""} has tax but no governed tax code.`.trim(), amount: line.tax_amount }));
      for (const line of unresolvedCodeLines) exceptions.push(exception({ code: "INPUT_TAX_CODE_UNRESOLVED", sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference, date: invoiceDate, detail: `Vendor invoice line ${line.line_number ?? ""} references a tax code that is not available in this organisation.`.trim(), amount: line.tax_amount }));
      for (const line of ineligibleVatLines) {
        const rule = rulesById.get(line.tax_code_id);
        exceptions.push(exception({ code: "INPUT_VAT_RULE_NOT_EFFECTIVE", sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference, date: invoiceDate, detail: `${rule?.tax_code || "VAT code"} is inactive or outside its effective dates for this invoice.`, amount: line.tax_amount }));
      }
    }

    if (eligibleVatLines.length && !readyInvoice) {
      inputPostingIssues += 1;
      const reversedLinkedJournal = linkedJournalPosted && linkedJournal?.reversed === true;
      exceptions.push(exception({
        code: reversedLinkedJournal ? "INPUT_POSTING_REVERSED" : "INPUT_NOT_APPROVED_POSTED",
        sourceType: "VENDOR_INVOICE",
        sourceId: invoice.id,
        reference,
        date: invoiceDate,
        detail: reversedLinkedJournal
          ? "The VAT-bearing vendor invoice is linked only to a reversed posting. Input VAT is excluded until a valid posted journal exists."
          : "Input VAT is only claimable here when the vendor invoice is approved, posted and its exact linked journal is still posted and valid.",
        amount: eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0),
      }));
    }

    if (foreignRateMissing) {
      inputRateIssues += 1;
      exceptions.push(exception({ code: "INPUT_EXCHANGE_RATE_MISSING", sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference, date: invoiceDate, detail: `Foreign-currency input VAT cannot use an implicit 1.0 rate against ${functionalCurrency}.`, amount: eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0) }));
    }

    const eligibleTax = eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0);
    if (eligibleVatLines.length) {
      relevantVendorRows.push(invoice);
      relevantVendorLines.push(...eligibleVatLines);
      if (linkedJournal) relevantVendorJournals.push(linkedJournal);
    }
    if (eligibleVatLines.length && readyInvoice) { inputTax += eligibleTax * exchangeRate(invoice); inputDocumentCount += 1; }

    if (vatLines.length || missingCodeLines.length || unresolvedCodeLines.length) {
      inputEvidence.push({
        id: invoice.id,
        reference,
        date: invoiceDate,
        currency_code: currencyOf(invoice) || functionalCurrency,
        tax_amount: roundMoney(eligibleTax),
        exchange_rate: invoice.exchange_rate,
        functional_tax_amount: readyInvoice ? roundMoney(eligibleTax * exchangeRate(invoice)) : 0,
        status: upper(invoice.status || "DRAFT"),
        approval_status: upper(invoice.approval_status || "PENDING"),
        journal_entry_id: invoice.journal_entry_id || null,
        journal_status: linkedJournal ? upper(linkedJournal.status) : null,
        journal_reversed: linkedJournal?.reversed === true,
        posting_valid: linkedJournalValid,
        vat_line_count: vatLines.length,
        eligible_vat_line_count: eligibleVatLines.length,
        source_updated_at: invoice.updated_at || invoice.created_at || null,
      });
    }
  }

  outputTax = roundMoney(outputTax);
  inputTax = roundMoney(inputTax);
  const taxPayable = Math.max(roundMoney(outputTax - inputTax), 0);
  const taxRefund = Math.max(roundMoney(inputTax - outputTax), 0);

  const duplicateGroups = new Map();
  for (const invoice of relevantVendorRows) {
    const invoiceNumber = upper(invoice.invoice_number);
    if (!invoiceNumber) continue;
    const party = text(invoice.vendor_party_id || invoice.vendor_id || "unknown");
    const key = `${party}|${invoiceNumber}`;
    const current = duplicateGroups.get(key) || [];
    current.push(invoice);
    duplicateGroups.set(key, current);
  }
  const duplicateRows = [...duplicateGroups.values()].filter(group => group.length > 1);
  for (const group of duplicateRows) {
    const invoice = group[0];
    exceptions.push(exception({ code: "POTENTIAL_DUPLICATE_VENDOR_INVOICE", severity: "WARNING", sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference: referenceOf(invoice, invoice.id), date: invoice.invoice_date, detail: `${group.length} vendor invoices share the same supplier and invoice number. Review before filing.` }));
  }

  const registrationReference = text(vatReturn.registration_reference || context.registrationReference);
  const missingRegistration = !registrationReference;
  const missingRules = periodVatRules.length === 0;
  const rateIssues = outputRateIssues + inputRateIssues;
  const codingIssues = inputCodingIssues + outputCodingIssues;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(vatReturn.filing_due_date && vatReturn.filing_due_date < today && status !== "SUBMITTED");

  const checks = [
    check({ code: "REGISTRATION_REFERENCE", label: "Tax registration", status: missingRegistration ? "BLOCK" : "PASS", detail: missingRegistration ? "Add the VAT registration reference before calculation." : registrationReference, count: missingRegistration ? 1 : 0, blocksCalculation: missingRegistration, blocksSubmission: missingRegistration }),
    check({ code: "VAT_RULES", label: "VAT configuration", status: missingRules ? "BLOCK" : "PASS", detail: missingRules ? `No active VAT rule covers ${jurisdiction || "this jurisdiction"} for the filing period.` : `${periodVatRules.length} active VAT rule${periodVatRules.length === 1 ? "" : "s"} cover the filing period.`, count: missingRules ? 1 : 0, blocksCalculation: missingRules, blocksSubmission: missingRules }),
    check({ code: "OUTPUT_CODING", label: "Sales VAT coding", status: outputCodingIssues ? "BLOCK" : "PASS", detail: outputCodingIssues ? `${outputCodingIssues} sales tax line${outputCodingIssues === 1 ? " needs" : "s need"} a governed, effective VAT rule.` : "Tax-bearing sales lines resolve to governed VAT rules.", count: outputCodingIssues, blocksCalculation: outputCodingIssues > 0, blocksSubmission: outputCodingIssues > 0 }),
    check({ code: "OUTPUT_POSTING", label: "Sales posting evidence", status: outputPostingIssues ? "BLOCK" : "PASS", detail: outputPostingIssues ? `${outputPostingIssues} VAT-bearing sales document${outputPostingIssues === 1 ? " is" : "s are"} not backed by valid posted accounting evidence.` : `${outputDocumentCount} posted sales document${outputDocumentCount === 1 ? "" : "s"} included.`, count: outputPostingIssues, blocksCalculation: outputPostingIssues > 0, blocksSubmission: outputPostingIssues > 0 }),
    check({ code: "INPUT_CODING", label: "Purchase VAT coding", status: inputCodingIssues ? "BLOCK" : "PASS", detail: inputCodingIssues ? `${inputCodingIssues} purchase tax line${inputCodingIssues === 1 ? " needs" : "s need"} governed tax coding or effective-rule repair.` : "Tax-bearing purchase lines resolve to governed VAT codes.", count: inputCodingIssues, blocksCalculation: inputCodingIssues > 0, blocksSubmission: inputCodingIssues > 0 }),
    check({ code: "INPUT_POSTING", label: "Purchase approval & posting", status: inputPostingIssues ? "BLOCK" : "PASS", detail: inputPostingIssues ? `${inputPostingIssues} VAT-bearing vendor invoice${inputPostingIssues === 1 ? " is" : "s are"} not fully approved and backed by a valid non-reversed posted journal.` : `${inputDocumentCount} posted purchase document${inputDocumentCount === 1 ? "" : "s"} included.`, count: inputPostingIssues, blocksCalculation: inputPostingIssues > 0, blocksSubmission: inputPostingIssues > 0 }),
    check({ code: "EXCHANGE_RATES", label: "Currency conversion", status: rateIssues ? "BLOCK" : "PASS", detail: rateIssues ? `${rateIssues} foreign-currency tax document${rateIssues === 1 ? " is" : "s are"} missing a real exchange rate.` : `Tax evidence can be translated to ${functionalCurrency} without an implicit 1.0 rate.`, count: rateIssues, blocksCalculation: rateIssues > 0, blocksSubmission: rateIssues > 0 }),
    check({ code: "FILING_DEADLINE", label: "Filing deadline", status: !vatReturn.filing_due_date || overdue ? "WARNING" : "PASS", detail: !vatReturn.filing_due_date ? "No filing due date is recorded. Add the statutory deadline so the work queue can prioritise it." : overdue ? `This return was due ${vatReturn.filing_due_date}. Filing can continue, but it should be treated as overdue work.` : `Due ${vatReturn.filing_due_date}.`, count: !vatReturn.filing_due_date || overdue ? 1 : 0 }),
    check({ code: "POTENTIAL_DUPLICATES", label: "Duplicate review", status: duplicateRows.length ? "WARNING" : "PASS", detail: duplicateRows.length ? `${duplicateRows.length} potential duplicate vendor invoice group${duplicateRows.length === 1 ? " needs" : "s need"} human review.` : "No supplier/invoice-number duplicates detected in VAT-bearing purchases.", count: duplicateRows.length }),
  ];

  const current = {
    method: "POSTED_GOVERNED_VAT_LINE_EVIDENCE_V2",
    output_document_count: outputDocumentCount,
    customer_credit_note_count: customerCreditNoteCount,
    input_document_count: inputDocumentCount,
    output_tax: outputTax,
    input_tax: inputTax,
    tax_payable: taxPayable,
    tax_refund: taxRefund,
    currency_code: functionalCurrency,
  };

  const stored = vatReturn.calculation && typeof vatReturn.calculation === "object" ? vatReturn.calculation : {};
  const calculatedAt = vatReturn.calculated_at || stored.calculated_at || null;
  const freshnessReasons = [];

  if (status === "CALCULATED") {
    const comparable = [
      ["output document count", numeric(stored.output_document_count, -1), current.output_document_count, 0],
      ["credit note count", numeric(stored.customer_credit_note_count, -1), current.customer_credit_note_count, 0],
      ["input document count", numeric(stored.input_document_count, -1), current.input_document_count, 0],
      ["output VAT", numeric(stored.output_tax, Number.NaN), current.output_tax, MONEY_TOLERANCE],
      ["input VAT", numeric(stored.input_tax, Number.NaN), current.input_tax, MONEY_TOLERANCE],
      ["tax payable", numeric(stored.tax_payable, Number.NaN), current.tax_payable, MONEY_TOLERANCE],
      ["tax refund", numeric(stored.tax_refund, Number.NaN), current.tax_refund, MONEY_TOLERANCE],
    ];
    for (const [label, oldValue, newValue, tolerance] of comparable) {
      if (!Number.isFinite(oldValue) || Math.abs(oldValue - newValue) > tolerance) freshnessReasons.push(`${label} changed`);
    }

    const relevantCustomerIds = new Set(relevantCustomerRows.map(row => row.id));
    const sourceChanged = [
      ...relevantCustomerRows,
      ...relevantCustomerLines,
      ...journalEntries.filter(row => relevantCustomerIds.has(row.source_document_id)),
      ...relevantVendorRows,
      ...relevantVendorLines,
      ...relevantVendorJournals,
      ...periodVatRules,
    ].some(row => changedAfter(row, calculatedAt));
    if (sourceChanged) freshnessReasons.push("source evidence changed after calculation");
    if (!calculatedAt) freshnessReasons.push("calculation timestamp is missing");
  }

  const calculationStale = status === "CALCULATED" && freshnessReasons.length > 0;
  checks.push(check({
    code: "CALCULATION_FRESHNESS",
    label: "Calculation freshness",
    status: status === "DRAFT" ? "INFO" : calculationStale ? "BLOCK" : "PASS",
    detail: status === "DRAFT" ? "Calculate after all blocking evidence checks pass." : calculationStale ? `Recalculate before filing: ${[...new Set(freshnessReasons)].join(", ")}.` : status === "SUBMITTED" ? "Filed return is immutable in Avantiqo." : `Calculation matches current governed evidence${calculatedAt ? ` from ${calculatedAt}` : ""}.`,
    count: calculationStale ? freshnessReasons.length : 0,
    blocksSubmission: calculationStale,
  }));

  if (status === "SUBMITTED") checks.push(check({ code: "SUBMITTED_IMMUTABLE", label: "Filing state", status: "PASS", detail: `Submitted${vatReturn.submission_reference ? ` · ${vatReturn.submission_reference}` : ""}. Accounting filing evidence is immutable.` }));

  const calculationBlockers = checks.filter(item => item.status === "BLOCK" && item.blocks_calculation);
  const submissionBlockers = checks.filter(item => item.status === "BLOCK" && item.blocks_submission);
  if (status !== "CALCULATED" && status !== "SUBMITTED") {
    submissionBlockers.push(check({ code: "CALCULATION_REQUIRED", label: "Calculation required", status: "BLOCK", detail: "Calculate the return from governed accounting evidence before recording submission.", count: 1, blocksSubmission: true }));
  }

  const readyToCalculate = status !== "SUBMITTED" && calculationBlockers.length === 0;
  const readyToSubmit = status === "CALCULATED" && submissionBlockers.length === 0;
  const state = status === "SUBMITTED" ? "SUBMITTED" : readyToSubmit ? "READY_TO_FILE" : readyToCalculate ? status === "CALCULATED" ? "CALCULATED" : "READY_TO_CALCULATE" : "NEEDS_ATTENTION";

  return {
    return: { ...vatReturn, registration_reference: registrationReference || vatReturn.registration_reference || null },
    entity: { id: context.entity.id, code: context.entity.code || null, legal_name: context.entity.legal_name || context.entity.display_name || null, functional_currency: functionalCurrency },
    state,
    ready_to_calculate: readyToCalculate,
    ready_to_submit: readyToSubmit,
    calculation_stale: calculationStale,
    calculation_blockers: calculationBlockers,
    submission_blockers: submissionBlockers,
    checks,
    current,
    calculated: { at: calculatedAt, by: vatReturn.calculated_by || null, values: stored, freshness_reasons: [...new Set(freshnessReasons)] },
    evidence: {
      preview_limit: EVIDENCE_PREVIEW_LIMIT,
      output_total: outputEvidence.length,
      input_total: inputEvidence.length,
      exception_total: exceptions.length,
      output_truncated: outputEvidence.length > EVIDENCE_PREVIEW_LIMIT,
      input_truncated: inputEvidence.length > EVIDENCE_PREVIEW_LIMIT,
      exceptions_truncated: exceptions.length > EVIDENCE_PREVIEW_LIMIT,
      output: outputEvidence.slice(0, EVIDENCE_PREVIEW_LIMIT),
      input: inputEvidence.slice(0, EVIDENCE_PREVIEW_LIMIT),
      exceptions: exceptions.slice(0, EVIDENCE_PREVIEW_LIMIT),
    },
    vat_rules: periodVatRules.map(rule => ({ id: rule.id, tax_code: rule.tax_code, tax_name: rule.tax_name, tax_rate: rule.tax_rate, effective_from: rule.effective_from, effective_to: rule.effective_to, inherited: !rule.organization_id })),
    due: { filing_due_date: vatReturn.filing_due_date || null, overdue, missing: !vatReturn.filing_due_date },
  };
}
