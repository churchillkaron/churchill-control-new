import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeTaxExceptionMatchesDependency } from "@/lib/finance/tax/FinanceTaxEvidenceDrilldownPolicy";

const PAGE_SIZE = 1000;
const MAX_ROWS = 250000;

function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function numeric(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nonZero(value) { return Math.abs(numeric(value)) > 0.0000001; }
function beforeOrEqual(left, right) { return !left || !right || String(left) <= String(right); }
function afterOrEqual(left, right) { return !left || !right || String(left) >= String(right); }
function currencyOf(row) { return upper(row?.currency_code || row?.currency); }
function missingExchangeRate(row, functionalCurrency) {
  const currency = currencyOf(row);
  if (!currency || !functionalCurrency || currency === functionalCurrency) return false;
  const rate = Number(row?.exchange_rate);
  return !Number.isFinite(rate) || rate === 0;
}
function referenceOf(row, fallback) { return text(row?.invoice_number || row?.reference || row?.document_number || fallback); }
function bounded(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function fetchPaged(makeQuery, label) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await makeQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (rows.length > MAX_ROWS) throw new Error(`${label} exceeds the ${MAX_ROWS.toLocaleString("en-US")} row drill-down limit`);
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
    const result = await fetchPaged(() => {
      let query = supabaseAdmin.from(table).select("*").in(column, group);
      if (apply) query = apply(query);
      return query;
    }, label);
    rows.push(...result);
    if (rows.length > MAX_ROWS) throw new Error(`${label} exceeds the ${MAX_ROWS.toLocaleString("en-US")} row drill-down limit`);
  }
  return rows;
}

function ruleEffective(rule, invoiceDate) {
  if (rule?.is_active !== true) return false;
  if (!beforeOrEqual(rule?.effective_from, invoiceDate)) return false;
  if (!afterOrEqual(rule?.effective_to, invoiceDate)) return false;
  return true;
}

function sourceRecord(row, type) {
  if (!row) return null;
  const common = {
    id: row.id || null,
    reference: referenceOf(row, row.id),
    date: row.invoice_date || row.posting_date || row.document_date || row.created_at || null,
    status: upper(row.status) || null,
    currency_code: currencyOf(row) || null,
    exchange_rate: row.exchange_rate ?? null,
    updated_at: row.updated_at || null,
  };
  if (type === "VENDOR_INVOICE") {
    return { ...common, approval_status: upper(row.approval_status) || null, journal_entry_id: row.journal_entry_id || null, vendor_party_id: row.vendor_party_id || row.vendor_id || null };
  }
  if (type === "CUSTOMER_INVOICE") {
    return { ...common, document_type: upper(row.document_type || "INVOICE") };
  }
  return common;
}

function lineRecord(line, side) {
  if (!line) return null;
  return {
    id: line.id || null,
    line_number: line.line_number ?? null,
    description: text(line.description || line.memo || line.name) || null,
    tax_amount: line.tax_amount == null ? null : Number(line.tax_amount),
    tax_rule_id: side === "OUTPUT" ? line.tax_rule_id || null : line.tax_code_id || null,
  };
}

function ruleRecord(rule) {
  if (!rule) return null;
  return {
    id: rule.id || null,
    tax_code: rule.tax_code || null,
    tax_name: rule.tax_name || null,
    tax_rate: rule.tax_rate ?? null,
    tax_regime: upper(rule.tax_regime) || null,
    is_active: rule.is_active === true,
    effective_from: rule.effective_from || null,
    effective_to: rule.effective_to || null,
    inherited: !rule.organization_id,
  };
}

function journalRecord(journal) {
  if (!journal) return null;
  return {
    id: journal.id || null,
    reference: journal.reference || journal.document_number || null,
    posting_date: journal.posting_date || journal.entry_date || null,
    status: upper(journal.status) || null,
    reversed: journal.reversed === true,
    source_document_id: journal.source_document_id || null,
  };
}

function workspaceTarget(sourceType, sourceId) {
  const type = upper(sourceType);
  if (type === "CUSTOMER_INVOICE") return { workspace: "customer_invoices", record_id: sourceId, context_mutation_allowed: false };
  if (type === "VENDOR_INVOICE") return { workspace: "vendor_invoices", record_id: sourceId, context_mutation_allowed: false };
  if (type === "JOURNAL_ENTRY") return { workspace: "journal_entries", record_id: sourceId, context_mutation_allowed: false };
  if (type === "TAX_RULE") return { workspace: "tax_rules", record_id: sourceId, context_mutation_allowed: false };
  return null;
}

function issue({ code, sourceType, sourceId, reference, date, detail, amount = null, source = null, line = null, rule = null, journal = null }) {
  return {
    code,
    severity: code === "POTENTIAL_DUPLICATE_VENDOR_INVOICE" ? "WARNING" : "BLOCK",
    source_type: sourceType,
    source_id: sourceId,
    reference,
    date,
    detail,
    amount: amount == null ? null : Number(amount),
    source_record: source,
    tax_line: line,
    tax_rule: rule,
    posting_journal: journal,
    workspace_target: workspaceTarget(sourceType, sourceId),
  };
}

async function loadBase({ organizationId, entityId, vatReturnId }) {
  const [{ data: vatReturn, error: returnError }, { data: entity, error: entityError }, { data: profiles, error: profileError }, rules] = await Promise.all([
    supabaseAdmin.from("finance_vat_returns").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).eq("id", vatReturnId).maybeSingle(),
    supabaseAdmin.from("legal_entities").select("*").eq("organization_id", organizationId).eq("id", entityId).maybeSingle(),
    supabaseAdmin.from("finance_organization_profiles").select("*").eq("organization_id", organizationId),
    fetchPaged(() => supabaseAdmin.from("tax_rules").select("*").or(`organization_id.eq.${organizationId},organization_id.is.null`).order("tax_name", { ascending: true }), "Tax rule drill-down evidence"),
  ]);
  if (returnError) throw new Error(returnError.message);
  if (!vatReturn) throw new Error("VAT return not found in organization and entity scope");
  if (entityError) throw new Error(entityError.message);
  if (!entity) throw new Error("Legal entity not found in organization scope");
  if (profileError) throw new Error(profileError.message);
  const profileRows = profiles || [];
  const profile = profileRows.find(row => row.entity_id === entityId) || profileRows.find(row => !row.entity_id) || null;
  return {
    vatReturn,
    rules,
    rulesById: new Map(rules.map(row => [row.id, row])),
    functionalCurrency: upper(profile?.functional_currency || profile?.base_currency || entity?.currency || "THB"),
  };
}

async function loadCustomerEvidence({ organizationId, entityId, vatReturn, rulesById, functionalCurrency, dependencyCode }) {
  const invoices = await fetchPaged(() => supabaseAdmin.from("customer_invoices").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).gte("invoice_date", vatReturn.period_start).lte("invoice_date", vatReturn.period_end).order("invoice_date", { ascending: true }).order("id", { ascending: true }), "Customer Tax drill-down evidence");
  const ids = invoices.map(row => row.id).filter(Boolean);
  const [lines, journals] = await Promise.all([
    fetchByIds({ table: "customer_invoice_lines", column: "customer_invoice_id", ids, apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("customer_invoice_id", { ascending: true }).order("created_at", { ascending: true }), label: "Customer Tax line drill-down evidence" }),
    fetchByIds({ table: "journal_entries", column: "source_document_id", ids, apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("created_at", { ascending: true }), label: "Customer Tax journal drill-down evidence" }),
  ]);
  const linesByInvoice = new Map();
  for (const row of lines) {
    const current = linesByInvoice.get(row.customer_invoice_id) || [];
    current.push(row);
    linesByInvoice.set(row.customer_invoice_id, current);
  }
  const journalsByInvoice = new Map();
  for (const row of journals) {
    const current = journalsByInvoice.get(row.source_document_id) || [];
    current.push(row);
    journalsByInvoice.set(row.source_document_id, current);
  }
  const jurisdiction = upper(vatReturn.jurisdiction_code);
  const issues = [];
  for (const invoice of invoices) {
    const invoiceLines = linesByInvoice.get(invoice.id) || [];
    const invoiceJournals = journalsByInvoice.get(invoice.id) || [];
    const reference = referenceOf(invoice, invoice.id);
    const eligibleVatLines = invoiceLines.filter(line => {
      const rule = rulesById.get(line.tax_rule_id);
      return rule && upper(rule.tax_type) === "VAT" && upper(rule.tax_regime) === jurisdiction && nonZero(line.tax_amount) && ruleEffective(rule, invoice.invoice_date);
    });
    if (dependencyCode === "OUTPUT_CODING") {
      for (const line of invoiceLines.filter(line => nonZero(line.tax_amount))) {
        const rule = line.tax_rule_id ? rulesById.get(line.tax_rule_id) || null : null;
        let code = null;
        let detail = null;
        if (!line.tax_rule_id) {
          code = "OUTPUT_TAX_CODE_MISSING";
          detail = `Customer invoice line ${line.id} has tax but no governed tax rule.`;
        } else if (!rule) {
          code = "OUTPUT_TAX_CODE_UNRESOLVED";
          detail = `Customer invoice line ${line.id} references a tax rule that is not available in this organisation.`;
        } else if (upper(rule.tax_type) === "VAT" && upper(rule.tax_regime) === jurisdiction && !ruleEffective(rule, invoice.invoice_date)) {
          code = "OUTPUT_VAT_RULE_NOT_EFFECTIVE";
          detail = `${rule.tax_code || "VAT code"} is inactive or outside its effective dates for this sales line.`;
        }
        if (code) issues.push(issue({ code, sourceType: "CUSTOMER_INVOICE", sourceId: invoice.id, reference, date: invoice.invoice_date, detail, amount: line.tax_amount, source: sourceRecord(invoice, "CUSTOMER_INVOICE"), line: lineRecord(line, "OUTPUT"), rule: ruleRecord(rule), journal: journalRecord(invoiceJournals.find(row => upper(row.status) === "POSTED") || invoiceJournals[0]) }));
      }
    }
    if (dependencyCode === "OUTPUT_POSTING" && eligibleVatLines.length) {
      const posted = invoiceJournals.filter(row => upper(row.status) === "POSTED");
      const valid = posted.filter(row => row.reversed !== true);
      if (!valid.length) {
        const code = posted.length ? "OUTPUT_POSTING_REVERSED" : "OUTPUT_NOT_POSTED";
        issues.push(issue({ code, sourceType: "CUSTOMER_INVOICE", sourceId: invoice.id, reference, date: invoice.invoice_date, detail: posted.length ? "The VAT-bearing sales document only has reversed posting evidence." : "VAT-bearing sales document is not backed by a posted journal entry.", amount: eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0), source: sourceRecord(invoice, "CUSTOMER_INVOICE"), journal: journalRecord(posted[0] || invoiceJournals[0]) }));
      }
    }
    if (dependencyCode === "EXCHANGE_RATES" && eligibleVatLines.length && missingExchangeRate(invoice, functionalCurrency)) {
      issues.push(issue({ code: "OUTPUT_EXCHANGE_RATE_MISSING", sourceType: "CUSTOMER_INVOICE", sourceId: invoice.id, reference, date: invoice.invoice_date, detail: `Foreign-currency output VAT cannot use an implicit 1.0 rate against ${functionalCurrency}.`, amount: eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0), source: sourceRecord(invoice, "CUSTOMER_INVOICE"), journal: journalRecord(invoiceJournals.find(row => upper(row.status) === "POSTED") || invoiceJournals[0]) }));
    }
  }
  return issues;
}

async function loadVendorEvidence({ organizationId, entityId, vatReturn, rulesById, functionalCurrency, dependencyCode }) {
  const invoices = await fetchPaged(() => supabaseAdmin.from("vendor_invoices").select("*").eq("organization_id", organizationId).eq("entity_id", entityId).gte("invoice_date", vatReturn.period_start).lte("invoice_date", vatReturn.period_end).order("invoice_date", { ascending: true }).order("id", { ascending: true }), "Vendor Tax drill-down evidence");
  const ids = invoices.map(row => row.id).filter(Boolean);
  const journalIds = [...new Set(invoices.map(row => row.journal_entry_id).filter(Boolean))];
  const [lines, journals] = await Promise.all([
    fetchByIds({ table: "vendor_invoice_lines", column: "vendor_invoice_id", ids, apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("vendor_invoice_id", { ascending: true }).order("line_number", { ascending: true }), label: "Vendor Tax line drill-down evidence" }),
    fetchByIds({ table: "journal_entries", column: "id", ids: journalIds, apply: query => query.eq("organization_id", organizationId).eq("entity_id", entityId).order("created_at", { ascending: true }), label: "Vendor Tax journal drill-down evidence" }),
  ]);
  const linesByInvoice = new Map();
  for (const row of lines) {
    const current = linesByInvoice.get(row.vendor_invoice_id) || [];
    current.push(row);
    linesByInvoice.set(row.vendor_invoice_id, current);
  }
  const journalsById = new Map(journals.map(row => [row.id, row]));
  const jurisdiction = upper(vatReturn.jurisdiction_code);
  const issues = [];
  const eligibleInvoices = [];
  for (const invoice of invoices) {
    const invoiceLines = linesByInvoice.get(invoice.id) || [];
    const linkedJournal = invoice.journal_entry_id ? journalsById.get(invoice.journal_entry_id) || null : null;
    const reference = referenceOf(invoice, invoice.id);
    const eligibleVatLines = invoiceLines.filter(line => {
      const rule = rulesById.get(line.tax_code_id);
      return rule && upper(rule.tax_type) === "VAT" && upper(rule.tax_regime) === jurisdiction && nonZero(line.tax_amount) && ruleEffective(rule, invoice.invoice_date);
    });
    if (eligibleVatLines.length) eligibleInvoices.push(invoice);
    if (dependencyCode === "INPUT_CODING") {
      for (const line of invoiceLines.filter(line => nonZero(line.tax_amount))) {
        const rule = line.tax_code_id ? rulesById.get(line.tax_code_id) || null : null;
        let code = null;
        let detail = null;
        if (!line.tax_code_id) {
          code = "INPUT_TAX_CODE_MISSING";
          detail = `Vendor invoice line ${line.line_number ?? ""} has tax but no governed tax code.`.trim();
        } else if (!rule) {
          code = "INPUT_TAX_CODE_UNRESOLVED";
          detail = `Vendor invoice line ${line.line_number ?? ""} references a tax code that is not available in this organisation.`.trim();
        } else if (upper(rule.tax_type) === "VAT" && upper(rule.tax_regime) === jurisdiction && !ruleEffective(rule, invoice.invoice_date)) {
          code = "INPUT_VAT_RULE_NOT_EFFECTIVE";
          detail = `${rule.tax_code || "VAT code"} is inactive or outside its effective dates for this invoice.`;
        }
        if (code) issues.push(issue({ code, sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference, date: invoice.invoice_date, detail, amount: line.tax_amount, source: sourceRecord(invoice, "VENDOR_INVOICE"), line: lineRecord(line, "INPUT"), rule: ruleRecord(rule), journal: journalRecord(linkedJournal) }));
      }
    }
    if (dependencyCode === "INPUT_POSTING" && eligibleVatLines.length) {
      const linkedJournalPosted = Boolean(linkedJournal && upper(linkedJournal.status) === "POSTED");
      const valid = linkedJournalPosted && linkedJournal.reversed !== true;
      const ready = upper(invoice.status) === "POSTED" && upper(invoice.approval_status) === "APPROVED" && Boolean(invoice.journal_entry_id) && valid;
      if (!ready) {
        const code = linkedJournalPosted && linkedJournal?.reversed === true ? "INPUT_POSTING_REVERSED" : "INPUT_NOT_APPROVED_POSTED";
        issues.push(issue({ code, sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference, date: invoice.invoice_date, detail: code === "INPUT_POSTING_REVERSED" ? "The VAT-bearing vendor invoice is linked only to a reversed posting." : "Input VAT requires an approved, posted vendor invoice backed by its exact valid posted journal.", amount: eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0), source: sourceRecord(invoice, "VENDOR_INVOICE"), journal: journalRecord(linkedJournal) }));
      }
    }
    if (dependencyCode === "EXCHANGE_RATES" && eligibleVatLines.length && missingExchangeRate(invoice, functionalCurrency)) {
      issues.push(issue({ code: "INPUT_EXCHANGE_RATE_MISSING", sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference, date: invoice.invoice_date, detail: `Foreign-currency input VAT cannot use an implicit 1.0 rate against ${functionalCurrency}.`, amount: eligibleVatLines.reduce((sum, line) => sum + numeric(line.tax_amount), 0), source: sourceRecord(invoice, "VENDOR_INVOICE"), journal: journalRecord(linkedJournal) }));
    }
  }
  if (dependencyCode === "POTENTIAL_DUPLICATES") {
    const groups = new Map();
    for (const invoice of eligibleInvoices) {
      const invoiceNumber = upper(invoice.invoice_number);
      if (!invoiceNumber) continue;
      const party = text(invoice.vendor_party_id || invoice.vendor_id || "unknown");
      const key = `${party}|${invoiceNumber}`;
      const current = groups.get(key) || [];
      current.push(invoice);
      groups.set(key, current);
    }
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      const invoice = group[0];
      issues.push(issue({ code: "POTENTIAL_DUPLICATE_VENDOR_INVOICE", sourceType: "VENDOR_INVOICE", sourceId: invoice.id, reference: referenceOf(invoice, invoice.id), date: invoice.invoice_date, detail: `${group.length} vendor invoices share the same supplier and invoice number.`, source: { ...sourceRecord(invoice, "VENDOR_INVOICE"), duplicate_record_ids: group.map(row => row.id) } }));
    }
  }
  return issues;
}

export async function loadFinanceTaxEvidencePopulation({ organizationId, entityId, vatReturnId, dependencyCode, offset = 0, limit = 25 } = {}) {
  const code = upper(dependencyCode);
  const safeOffset = bounded(offset, 0, 0, MAX_ROWS);
  const safeLimit = bounded(limit, 25, 1, 50);
  const base = await loadBase({ organizationId, entityId, vatReturnId });
  let issues = [];
  if (["OUTPUT_CODING", "OUTPUT_POSTING"].includes(code)) {
    issues = await loadCustomerEvidence({ organizationId, entityId, vatReturn: base.vatReturn, rulesById: base.rulesById, functionalCurrency: base.functionalCurrency, dependencyCode: code });
  } else if (["INPUT_CODING", "INPUT_POSTING", "POTENTIAL_DUPLICATES"].includes(code)) {
    issues = await loadVendorEvidence({ organizationId, entityId, vatReturn: base.vatReturn, rulesById: base.rulesById, functionalCurrency: base.functionalCurrency, dependencyCode: code });
  } else if (code === "EXCHANGE_RATES") {
    const [customer, vendor] = await Promise.all([
      loadCustomerEvidence({ organizationId, entityId, vatReturn: base.vatReturn, rulesById: base.rulesById, functionalCurrency: base.functionalCurrency, dependencyCode: code }),
      loadVendorEvidence({ organizationId, entityId, vatReturn: base.vatReturn, rulesById: base.rulesById, functionalCurrency: base.functionalCurrency, dependencyCode: code }),
    ]);
    issues = [...customer, ...vendor].sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")) || String(left.source_id || "").localeCompare(String(right.source_id || "")));
  }
  const filtered = issues.filter(row => financeTaxExceptionMatchesDependency(code, row.code));
  return {
    issues: filtered.slice(safeOffset, safeOffset + safeLimit),
    population: {
      total: filtered.length,
      offset: safeOffset,
      limit: safeLimit,
      returned: Math.max(0, Math.min(safeLimit, filtered.length - safeOffset)),
      has_more: safeOffset + safeLimit < filtered.length,
      complete: true,
    },
  };
}
