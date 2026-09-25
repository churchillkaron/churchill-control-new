function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function shiftIsoDate(isoDate, dayOffset) {
  const source = text(isoDate, 20);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(source) || !Number.isInteger(dayOffset) || dayOffset === 0) return null;
  const date = new Date(source + "T12:00:00Z");
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}
function requestedDateShiftDays(message) {
  const source = text(message, 4000).toLowerCase();
  const explicit = source.match(/\b(\d{1,3})\s*days?\s*(back|backward|earlier|before|forward|later|after)\b/);
  if (explicit) {
    const days = Math.max(1, Math.min(365, Number(explicit[1]) || 0));
    return ["back", "backward", "earlier", "before"].includes(explicit[2]) ? -days : days;
  }
  if (/\b(?:the\s+)?week\s+before\b|\bprevious\s+week\b/.test(source)) return -7;
  if (/\b(?:the\s+)?week\s+after\b|\bnext\s+week\b/.test(source)) return 7;
  return null;
}
function shiftDatesInText(value, dayOffset) {
  return text(value, 2000).replace(/\b20\d{2}-\d{2}-\d{2}\b/g, (iso) => shiftIsoDate(iso, dayOffset) || iso);
}
function findInvoiceRows(value, depth = 0) {
  if (depth > 6 || value == null) return [];
  if (Array.isArray(value)) {
    if (value.some((row) => row && typeof row === "object" && (row.invoice_date || row.invoice_number) && row.id)) {
      return value.filter((row) => row && typeof row === "object");
    }
    for (const item of value) {
      const rows = findInvoiceRows(item, depth + 1);
      if (rows.length) return rows;
    }
    return [];
  }
  if (typeof value !== "object") return [];
  if (Array.isArray(value.invoices)) return value.invoices.filter((row) => row && typeof row === "object");
  for (const key of ["result", "data", "response", "body", "output"]) {
    const rows = findInvoiceRows(value[key], depth + 1);
    if (rows.length) return rows;
  }
  return [];
}
function safeReplacementLine(line, dayOffset) {
  const source = object(line);
  const output = {};
  for (const key of [
    "description", "quantity", "unit_price", "line_total", "item_id", "tax_code_id",
    "tax_rule_id", "department_id", "cost_center_id", "project_id", "revenue_account_id",
  ]) {
    if (source[key] !== undefined && source[key] !== null) output[key] = source[key];
  }
  output.description = shiftDatesInText(source.description, dayOffset);
  return output;
}
export function materializeRegisteredRevisionDeterministically({
  message,
  priorPayload = {},
  actionKey,
  evidence = [],
  correctionDate = null,
} = {}) {
  if (text(actionKey, 300) !== "finance.accounts_receivable.CorrectCustomerInvoice") return null;
  const dayOffset = requestedDateShiftDays(message);
  if (!dayOffset) return null;

  const prior = object(priorPayload);
  const priorPartyId = text(prior.party_id || prior.partyId, 200);
  let invoices = findInvoiceRows(evidence);
  if (priorPartyId) invoices = invoices.filter((invoice) => !invoice.party_id || text(invoice.party_id, 200) === priorPartyId);
  invoices = invoices.filter((invoice) => text(invoice.id, 200) && text(invoice.invoice_date, 20));
  invoices.sort((a, b) => {
    const created = text(b.created_at, 80).localeCompare(text(a.created_at, 80));
    return created || text(b.invoice_date, 20).localeCompare(text(a.invoice_date, 20));
  });
  const source = invoices[0] || null;
  if (!source) {
    return {
      payload: {},
      clarification_required: true,
      clarification_question: "I could not resolve the exact current source invoice from the fresh Finance read.",
      summary: null,
    };
  }

  const invoiceDate = shiftIsoDate(source.invoice_date, dayOffset);
  const dueDate = shiftIsoDate(source.due_date || source.invoice_date, dayOffset);
  const lines = list(source.lines).map((line) => safeReplacementLine(line, dayOffset));
  if (!invoiceDate || !dueDate || !lines.length) {
    return {
      payload: {},
      clarification_required: true,
      clarification_question: "I found the source invoice, but its current dates or line details are incomplete for a safe correction.",
      summary: null,
    };
  }

  const direction = dayOffset < 0 ? "earlier" : "later";
  const days = Math.abs(dayOffset);
  return {
    payload: {
      source_invoice_id: text(source.id, 200),
      correction_date: text(correctionDate, 20) || invoiceDate,
      reason: "User-requested invoice date correction: " + days + " day" + (days === 1 ? "" : "s") + " " + direction + ".",
      replacement: {
        invoice_date: invoiceDate,
        due_date: dueDate,
        lines,
        ...(source.notes ? { notes: source.notes } : {}),
      },
    },
    clarification_required: false,
    clarification_question: null,
    summary: "I prepared the correction for " + (text(source.invoice_number, 120) || "the latest customer invoice") + ": invoice and due date " + invoiceDate + ", with service dates shifted " + days + " day" + (days === 1 ? "" : "s") + " " + direction + ". It has not executed yet.",
  };
}
