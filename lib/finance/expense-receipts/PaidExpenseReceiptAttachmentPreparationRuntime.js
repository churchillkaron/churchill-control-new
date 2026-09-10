import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_PAID_EXPENSE_RECEIPT_PREPARATION_V1";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function evidence(file = {}) {
  return object(object(file.analysis).evidence);
}

function fields(file = {}) {
  const source = evidence(file);
  return { ...object(source.key_fields), ...object(source.identifiers), ...source };
}
function value(source, names) {
  const index = new Map(Object.entries(object(source)).map(([key, entry]) => [normalized(key), entry]));
  for (const name of names) {
    const found = index.get(normalized(name));
    if (found !== undefined && found !== null && found !== "") return found;
  }
  return null;
}

function numberValue(source, names) {
  const raw = value(source, names);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function paymentStatus(source) {
  const status = normalized(value(source, ["payment_status", "paid_status", "status"]));
  if (["paid", "settled", "completed"].includes(status)) return "PAID";
  if (["unpaid", "open", "due", "payable"].includes(status)) return "UNPAID";
  return "UNKNOWN";
}

function semanticKind(file = {}) {
  const source = evidence(file);
  return normalized(`${source.document_type || ""} ${source.object_type || ""}`);
}

function receiptLike(file = {}) {
  const kind = semanticKind(file);
  return /receipt|cash_purchase|card_purchase|expense/.test(kind)
    || /supplier_invoice|vendor_invoice|vendor_bill|supplier_bill/.test(kind);
}
function normalizeLineItems(source = {}) {
  const raw = list(value(source, ["line_items", "items", "lines"]));
  if (!raw.length) {
    const total = numberValue(source, ["total_amount", "amount", "gross_amount", "total"]);
    const tax = numberValue(source, ["tax_amount", "vat_amount", "tax"]);
    return total && total > 0 ? [{
      description: text(value(source, ["description", "supplier_name", "merchant_name"])) || "Expense receipt",
      gross_amount: total,
      tax_amount: tax && tax > 0 ? tax : 0,
      posting_account_code: text(value(source, ["expense_account_code", "account_code"])) || null,
      tax_account_code: text(value(source, ["tax_account_code", "vat_account_code"])) || null,
    }] : [];
  }

  return raw.map((entry, index) => {
    const row = object(entry);
    const gross = Number(row.gross_amount ?? row.total_amount ?? row.line_total ?? row.amount ?? 0);
    const tax = Number(row.tax_amount ?? row.vat_amount ?? row.tax ?? 0);
    return {
      description: text(row.description || row.name || row.item || `Expense line ${index + 1}`),
      gross_amount: Number.isFinite(gross) ? gross : 0,
      tax_amount: Number.isFinite(tax) ? tax : 0,
      posting_account_code: text(row.posting_account_code || row.expense_account_code || row.account_code) || null,
      tax_account_code: text(row.tax_account_code || row.vat_account_code) || null,
      cost_center_id: text(row.cost_center_id, 80) || null,
      department_id: text(row.department_id, 80) || null,
      project_id: text(row.project_id, 80) || null,
    };
  });
}
async function accountOptions({ organizationId, entityId }) {
  const result = await supabaseAdmin.from("chart_of_accounts")
    .select("id,account_code,account_name,account_category,account_type,is_active")
    .eq("organization_id", organizationId).eq("entity_id", entityId).eq("is_active", true)
    .order("account_code");
  if (result.error) throw result.error;
  return (result.data || []).filter((row) => {
    const category = text(row.account_category).toUpperCase();
    return category.includes("EXPENSE") || category === "COGS" || category.startsWith("ASSET");
  }).slice(0, 120);
}

function resolveLineAccounts(lines, accounts) {
  const byCode = new Map(accounts.map((row) => [normalized(row.account_code), row]));
  return lines.map((line) => {
    const account = line.posting_account_code ? byCode.get(normalized(line.posting_account_code)) : null;
    const taxAccount = line.tax_account_code ? byCode.get(normalized(line.tax_account_code)) : null;
    return {
      ...line,
      posting_account_id: account?.id || null,
      tax_account_id: line.tax_amount > 0 ? taxAccount?.id || null : null,
    };
  });
}

async function paymentOptions({ organizationId, entityId }) {
  const [banks, cash] = await Promise.all([
    supabaseAdmin.from("bank_accounts")
      .select("id,bank_name,account_name,account_number,account_type,currency,currency_code,is_default,active,finance_account_id")
      .eq("organization_id", organizationId).eq("entity_id", entityId).eq("active", true),
    supabaseAdmin.from("operations_cash_locations")
      .select("id,name,location_type,currency_code,is_active,finance_account_id")
      .eq("organization_id", organizationId).eq("entity_id", entityId).eq("is_active", true),
  ]);
  if (banks.error) throw banks.error;
  if (cash.error) throw cash.error;
  return { banks: banks.data || [], cash: cash.data || [] };
}
function exactPaymentSource(source, options) {
  const method = normalized(value(source, ["payment_method", "payment_type", "tender"]));
  const accountNumber = text(value(source, ["payment_account_number", "bank_account_number", "account_number"]));
  const last4 = text(value(source, ["card_last4", "account_last4", "last4"]), 4);

  if (/cash/.test(method)) {
    return options.cash.length === 1
      ? { type: "CASH_LOCATION", id: options.cash[0].id, label: options.cash[0].name }
      : null;
  }

  if (/bank|transfer|debit|card|visa|mastercard|amex/.test(method)) {
    const matches = options.banks.filter((row) => {
      const candidate = text(row.account_number);
      if (accountNumber) return candidate === accountNumber;
      if (last4) return candidate.endsWith(last4);
      return false;
    });
    if (matches.length === 1) {
      const row = matches[0];
      return { type: "BANK_ACCOUNT", id: row.id, label: row.account_name || row.bank_name };
    }
  }
  return null;
}

function clarification({ status, date, currency, lines, payment, unresolvedAccounts }) {
  if (status === "UNKNOWN") return "Was this receipt already paid, or is it still payable to the supplier?";
  if (!date) return "What transaction date should I use for this paid receipt?";
  if (!currency) return "What currency should I use for this paid receipt?";
  if (!lines.length || lines.some((line) => !(line.gross_amount > 0))) return "I could not verify the receipt amount. What total should I record?";
  if (!payment) return "Which company payment source paid this receipt: bank account, cash location, company card, or another Finance account?";
  if (unresolvedAccounts.length) return "Which expense, asset, or COGS account should I use for the receipt line items?";
  return null;
}
export async function preparePaidExpenseReceiptAttachment({
  file = {}, organizationId, entityId,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (object(file.analysis).status !== "ANALYZED" || !receiptLike(file)) {
    return { contract: CONTRACT, recognized: false, authorization_effect: "NONE" };
  }

  const source = fields(file);
  const status = paymentStatus(source);
  if (status === "UNPAID") {
    return {
      contract: CONTRACT,
      recognized: false,
      payable_candidate: true,
      payment_status: "UNPAID",
      authorization_effect: "NONE",
    };
  }

  if (!entityId) {
    return {
      contract: CONTRACT, recognized: true, status: "CLARIFICATION_REQUIRED",
      payment_status: status, clarification_required: true,
      clarification_question: "Which legal entity paid or owns this expense receipt?",
      authorization_effect: "NONE",
    };
  }

  const [accounts, payments] = await Promise.all([
    accountOptions({ organizationId, entityId }),
    paymentOptions({ organizationId, entityId }),
  ]);
  const lines = resolveLineAccounts(normalizeLineItems(source), accounts);
  const payment = exactPaymentSource(source, payments);
  const date = text(value(source, ["transaction_date", "receipt_date", "date"]), 20) || null;
  const currency = text(value(source, ["currency", "currency_code"]), 10).toUpperCase() || null;
  const unresolvedAccounts = lines.filter((line) => !line.posting_account_id || (line.tax_amount > 0 && !line.tax_account_id));
  const question = clarification({ status, date, currency, lines, payment, unresolvedAccounts });

  return {
    contract: CONTRACT,
    recognized: true,
    status: question ? "CLARIFICATION_REQUIRED" : "READY_FOR_REVIEW",
    payment_status: status,
    receipt: {
      receipt_number: text(value(source, ["invoice_or_receipt_number", "receipt_number", "invoice_number", "reference_number"]), 160) || null,
      receipt_date: date,
      currency_code: currency,
      supplier_name: text(value(source, ["supplier_name", "merchant_name", "vendor_name"]), 300) || null,
      total_amount: lines.reduce((sum, line) => sum + Number(line.gross_amount || 0), 0),
      tax_amount: lines.reduce((sum, line) => sum + Number(line.tax_amount || 0), 0),
      lines,
    },
    payment_source: payment,
    available_payment_sources: {
      bank_accounts: payments.banks.slice(0, 20).map((row) => ({ id: row.id, label: row.account_name || row.bank_name, account_type: row.account_type, currency_code: row.currency_code || row.currency })),
      cash_locations: payments.cash.slice(0, 20).map((row) => ({ id: row.id, label: row.name, currency_code: row.currency_code })),
    },
    available_posting_accounts: accounts.slice(0, 80).map((row) => ({ id: row.id, code: row.account_code, name: row.account_name, category: row.account_category })),
    clarification_required: Boolean(question),
    clarification_question: question,
    import_payload: question ? null : {
      receipt_number: text(value(source, ["invoice_or_receipt_number", "receipt_number", "invoice_number", "reference_number"]), 160) || null,
      receipt_date: date,
      currency_code: currency,
      exchange_rate: 1,
      payment_source_type: payment.type,
      payment_source_id: payment.id,
      evidence_checksum: text(file.sha256, 128) || null,
      lines: lines.map(({ posting_account_code, tax_account_code, ...line }) => line),
    },
    authorization_effect: "NONE",
  };
}

export default preparePaidExpenseReceiptAttachment;
