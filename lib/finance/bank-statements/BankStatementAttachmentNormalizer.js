function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value : []; }
function normalizedKey(value) {
  return text(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function number(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const clean = text(value, 120).replace(/[,\s]/g, "").replace(/[A-Za-z฿$€£¥]/g, "");
  const parsed = Number(clean.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(parsed) ? parsed : null;
}
function dateOnly(value) {
  const raw = text(value, 100);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
const ALIASES = Object.freeze({
  date: ["transaction_date", "date", "posting_date", "value_date", "txn_date"],
  description: ["description", "details", "transaction_details", "narrative", "memo", "particulars"],
  reference: ["reference_number", "reference", "ref", "transaction_id", "cheque_number"],
  amount: ["amount", "transaction_amount", "value"],
  debit: ["debit", "withdrawal", "withdrawals", "money_out", "out"],
  credit: ["credit", "deposit", "deposits", "money_in", "in"],
  direction: ["direction", "type", "transaction_type", "dr_cr"],
  balance: ["balance", "running_balance", "closing_balance"],
});

function aliasValue(row, names) {
  const source = object(row);
  const indexed = new Map(Object.entries(source).map(([key, value]) => [normalizedKey(key), value]));
  for (const name of names) {
    if (indexed.has(name)) return indexed.get(name);
  }
  return null;
}
function directionValue(value) {
  const key = normalizedKey(value);
  if (["in", "credit", "cr", "deposit", "received"].includes(key)) return "IN";
  if (["out", "debit", "dr", "withdrawal", "paid"].includes(key)) return "OUT";
  return null;
}
function normalizeTransaction(row) {
  const transactionDate = dateOnly(aliasValue(row, ALIASES.date));
  const debit = number(aliasValue(row, ALIASES.debit));
  const credit = number(aliasValue(row, ALIASES.credit));
  const rawAmount = number(aliasValue(row, ALIASES.amount));
  const explicitDirection = directionValue(aliasValue(row, ALIASES.direction));
  let amount = null;
  let direction = explicitDirection;
  if (credit != null && credit !== 0) { amount = Math.abs(credit); direction = "IN"; }
  else if (debit != null && debit !== 0) { amount = Math.abs(debit); direction = "OUT"; }
  else if (rawAmount != null && rawAmount !== 0) {
    amount = Math.abs(rawAmount);
    direction ||= rawAmount < 0 ? "OUT" : null;
  }
  if (!transactionDate || !amount || !direction) return null;
  return {
    transaction_date: transactionDate,
    description: text(aliasValue(row, ALIASES.description), 1000) || null,
    amount,
    direction,
    reference_number: text(aliasValue(row, ALIASES.reference), 300) || null,
  };
}

function rowsFromStructuredEvidence(analysis = {}) {
  const excerpt = text(analysis.content_excerpt, 120000);
  if (!excerpt || analysis.structured_file_type === "pdf") return [];
  try {
    const parsed = JSON.parse(excerpt);
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.sheets)) {
      const rows = [];
      for (const sheet of parsed.sheets) {
        const sourceRows = list(sheet?.rows);
        if (sourceRows.length < 2) continue;
        const headers = list(sourceRows[0]?.values).map(normalizedKey);
        for (const sourceRow of sourceRows.slice(1)) {
          const values = list(sourceRow?.values);
          const mapped = {};
          headers.forEach((header, index) => { if (header) mapped[header] = values[index]; });
          rows.push(mapped);
        }
      }
      return rows;
    }
  } catch {}
  return [];
}

function documentTypeFromEvidence(file = {}) {
  const analysis = object(file.analysis);
  const evidence = object(analysis.evidence);
  return normalizedKey(evidence.document_type || evidence.object_type || "");
}
function bankStatementShape(rows = []) {
  if (!rows.length) return false;
  const keys = new Set(rows.slice(0, 10).flatMap((row) => Object.keys(object(row)).map(normalizedKey)));
  const hasDate = ALIASES.date.some((key) => keys.has(key));
  const hasMovement = [...ALIASES.amount, ...ALIASES.debit, ...ALIASES.credit].some((key) => keys.has(key));
  const hasContext = [...ALIASES.description, ...ALIASES.reference, ...ALIASES.balance].some((key) => keys.has(key));
  return hasDate && hasMovement && hasContext;
}

export function normalizeBankStatementAttachment(file = {}) {
  const analysis = object(file.analysis);
  const evidence = object(analysis.evidence);
  const rows = rowsFromStructuredEvidence(analysis);
  const provenByVision = documentTypeFromEvidence(file) === "bank_statement";
  const provenByStructure = bankStatementShape(rows);
  if (!provenByVision && !provenByStructure) {
    return { recognized: false, status: "NOT_BANK_STATEMENT", authorization_effect: "NONE" };
  }
  const lines = rows.map(normalizeTransaction).filter(Boolean);
  const dates = lines.map((line) => line.transaction_date).sort();
  const openingBalance = number(evidence.opening_balance ?? evidence.fields?.OPENING_BALANCE ?? evidence.fields?.["OPENING BALANCE"]);
  const closingBalance = number(evidence.closing_balance ?? evidence.fields?.CLOSING_BALANCE ?? evidence.fields?.["CLOSING BALANCE"]);
  const statementNumber = text(evidence.statement_number || evidence.certification_id || evidence.reference_number, 300) || null;
  const currency = text(evidence.currency, 20).toUpperCase() || null;
  const missing = [];
  if (!statementNumber) missing.push("statement_number");
  if (!dates.length) missing.push("transaction_lines");
  if (openingBalance == null) missing.push("opening_balance");
  if (closingBalance == null) missing.push("closing_balance");
  if (!currency) missing.push("currency_code");
  return {
    recognized: true,
    status: missing.length ? "CLARIFICATION_OR_EXTRACTION_REQUIRED" : "READY_FOR_ACCOUNT_MATCH",
    confidence: provenByVision ? Number(evidence.confidence) || 0 : 0.85,
    statement: {
      statement_number: statementNumber,
      statement_start_date: dates[0] || null,
      statement_end_date: dates.at(-1) || null,
      opening_balance: openingBalance,
      closing_balance: closingBalance,
      currency_code: currency,
      lines,
    },
    missing_fields: missing,
    source_attachment_sha256: text(file.sha256, 128) || null,
    authorization_effect: "NONE",
  };
}
