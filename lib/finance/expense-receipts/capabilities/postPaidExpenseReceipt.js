import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";

const REQUIRED_PERMISSION = "finance.accounting.manage";
const PAYMENT_SOURCE_TYPES = new Set(["BANK_ACCOUNT", "CASH_LOCATION", "FINANCE_ACCOUNT"]);

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function actorId(context = {}) {
  return text(context.actor?.id || context.actor?.user_id || context.metadata?.actorId, 80);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
export const manifest = defineCapability({
  domain: "finance",
  capability: "expense_receipts",
  action: "post",
  name: "Post paid expense receipt",
  description: "Record an already-paid business receipt and atomically post its accounting journal without creating an accounts-payable liability.",
  permissions: [REQUIRED_PERMISSION],
  events: ["finance.expense_receipt.posted"],
  tags: ["finance", "expense", "receipt", "paid", "cash", "bank", "card"],
  transactional: true,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "approve",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "high",
  reversible: false,
  contextScope: "entity",
  inputSchema: {
    type: "object",
    properties: {
      supplier_party_id: { type: "string" },
      receipt_number: { type: "string" }, receipt_date: { type: "string" },
      currency_code: { type: "string" }, exchange_rate: { type: "number" },
      payment_source_type: { type: "string" }, payment_source_id: { type: "string" },
      evidence_document_id: { type: "string" }, evidence_checksum: { type: "string" },
      lines: { type: "array", items: { type: "object" } },
    },
    required: ["receipt_date", "currency_code", "payment_source_type", "payment_source_id", "lines"],
    additionalProperties: false,
  },
});

export function validate({ context, payload = {} }) {
  if (!text(context?.organizationId)) throw new Error("organization_id required");
  if (!text(context?.entityId)) throw new Error("entity_id required");
  if (!actorId(context)) throw new Error("authenticated actor required");
  if (!text(payload.receipt_date)) throw new Error("receipt_date required");
  if (!text(payload.currency_code)) throw new Error("currency_code required");
  if (!PAYMENT_SOURCE_TYPES.has(text(payload.payment_source_type).toUpperCase())) {
    throw new Error("supported payment_source_type required");
  }
  if (!text(payload.payment_source_id)) throw new Error("payment_source_id required");
  if (!Array.isArray(payload.lines) || payload.lines.length < 1) throw new Error("receipt lines required");
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}

async function resolvePaymentSource({ organizationId, entityId, type, sourceId }) {
  if (type === "BANK_ACCOUNT") {
    const result = await supabaseAdmin.from("bank_accounts")
      .select("id,finance_account_id,currency,currency_code,active")
      .eq("organization_id", organizationId).eq("entity_id", entityId)
      .eq("id", sourceId).eq("active", true).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data?.finance_account_id) {
      throw new Error("Selected bank account is unavailable or not mapped to Finance GL");
    }
    return {
      accountId: result.data.finance_account_id,
      currency: text(result.data.currency_code || result.data.currency).toUpperCase(),
    };
  }

  if (type === "CASH_LOCATION") {
    const result = await supabaseAdmin.from("operations_cash_locations")
      .select("id,finance_account_id,currency_code,is_active")
      .eq("organization_id", organizationId).eq("entity_id", entityId)
      .eq("id", sourceId).eq("is_active", true).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data?.finance_account_id) {
      throw new Error("Selected cash location is unavailable or not mapped to Finance GL");
    }
    return {
      accountId: result.data.finance_account_id,
      currency: text(result.data.currency_code).toUpperCase(),
    };
  }

  const result = await supabaseAdmin.from("chart_of_accounts")
    .select("id,account_category,account_type,currency_code,is_active")
    .eq("organization_id", organizationId).eq("entity_id", entityId)
    .eq("id", sourceId).eq("is_active", true).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Selected Finance payment account is unavailable");
  const category = text(result.data.account_category).toUpperCase();
  if (!(category.startsWith("ASSET") || category.startsWith("LIABILITY"))) {
    throw new Error("Direct payment account must be an asset or liability account");
  }
  return {
    accountId: result.data.id,
    currency: text(result.data.currency_code).toUpperCase(),
  };
}

async function validatePostingAccounts({ organizationId, entityId, lines }) {
  const ids = [...new Set(lines.flatMap((line) => [
    text(line.posting_account_id, 80),
    text(line.tax_account_id, 80),
  ]).filter(Boolean))];
  if (!ids.length) throw new Error("posting account required");

  const result = await supabaseAdmin.from("chart_of_accounts")
    .select("id,account_category,account_type,is_active")
    .eq("organization_id", organizationId).eq("entity_id", entityId)
    .eq("is_active", true).in("id", ids);
  if (result.error) throw result.error;

  const rows = new Map((result.data || []).map((row) => [String(row.id), row]));
  for (const id of ids) {
    if (!rows.has(id)) throw new Error("Receipt account is outside active organization/entity scope");
  }

  for (const line of lines) {
    const posting = rows.get(line.posting_account_id);
    const category = text(posting?.account_category).toUpperCase();
    if (!(category.includes("EXPENSE") || category === "COGS" || category.startsWith("ASSET"))) {
      throw new Error("Paid receipt posting account must be an expense, COGS, or asset account");
    }
  }
}

function normalizeLines(lines = []) {
  return lines.map((line, index) => {
    const gross = roundMoney(number(line.gross_amount));
    const tax = roundMoney(number(line.tax_amount) || 0);
    const posting = text(line.posting_account_id, 80);
    if (!posting) throw new Error(`line ${index + 1} posting_account_id required`);
    if (!(gross > 0)) throw new Error(`line ${index + 1} gross_amount must be positive`);
    if (tax < 0 || tax > gross) throw new Error(`line ${index + 1} tax_amount invalid`);
    if (tax > 0 && !text(line.tax_account_id, 80)) {
      throw new Error(`line ${index + 1} tax_account_id required when tax is positive`);
    }
    return {
      posting_account_id: posting,
      tax_account_id: text(line.tax_account_id, 80) || null,
      description: text(line.description, 1000) || `Expense receipt line ${index + 1}`,
      gross_amount: gross,
      tax_amount: tax,
      cost_center_id: text(line.cost_center_id, 80) || null,
      department_id: text(line.department_id, 80) || null,
      project_id: text(line.project_id, 80) || null,
    };
  });
}
function journalLines(lines, paymentAccountId) {
  const result = [];
  let total = 0;

  for (const line of lines) {
    const net = roundMoney(line.gross_amount - line.tax_amount);
    const dimensions = {
      cost_center_id: line.cost_center_id,
      department_id: line.department_id,
      project_id: line.project_id,
    };
    if (net > 0) {
      result.push({ account_id: line.posting_account_id, debit: net, credit: 0, description: `${line.description} net`, ...dimensions });
    }
    if (line.tax_amount > 0) {
      result.push({ account_id: line.tax_account_id, debit: line.tax_amount, credit: 0, description: `${line.description} tax`, ...dimensions });
    }
    total = roundMoney(total + line.gross_amount);
  }

  result.push({
    account_id: paymentAccountId,
    debit: 0,
    credit: total,
    description: "Paid expense settlement",
  });
  return result;
}

function idempotencyKey({ organizationId, entityId, payload, lines, paymentSourceId }) {
  const basis = [
    organizationId,
    entityId,
    text(payload.evidence_checksum, 128),
    text(payload.receipt_number, 160),
    text(payload.receipt_date, 20),
    text(payload.currency_code, 10).toUpperCase(),
    paymentSourceId,
    JSON.stringify(lines),
  ].join("|");
  return `operator-paid-expense-v1:${createHash("sha256").update(basis).digest("hex")}`;
}

export async function execute({ context, payload = {} }) {
  const organizationId = text(context.organizationId, 80);
  const entityId = text(context.entityId, 80);
  const createdBy = actorId(context);
  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) throw new Error("Selected legal entity is outside the organization or inactive");

  const type = text(payload.payment_source_type, 40).toUpperCase();
  const sourceId = text(payload.payment_source_id, 80);
  const currencyCode = text(payload.currency_code, 10).toUpperCase();
  const exchangeRate = number(payload.exchange_rate) || 1;
  if (!(exchangeRate > 0)) throw new Error("exchange_rate must be positive");

  const payment = await resolvePaymentSource({ organizationId, entityId, type, sourceId });
  if (payment.currency && payment.currency !== currencyCode) {
    throw new Error("Receipt currency does not match selected payment source");
  }

  const lines = normalizeLines(payload.lines);
  await validatePostingAccounts({ organizationId, entityId, lines });

  const receiptId = randomUUID();
  const key = idempotencyKey({ organizationId, entityId, payload, lines, paymentSourceId: sourceId });
  const result = await supabaseAdmin.rpc("finance_create_paid_expense_receipt_atomic", {
    p_receipt_id: receiptId,
    p_organization_id: organizationId,
    p_entity_id: entityId,
    p_supplier_party_id: text(payload.supplier_party_id, 80) || null,
    p_receipt_number: text(payload.receipt_number, 160) || null,
    p_receipt_date: text(payload.receipt_date, 20),
    p_currency_code: currencyCode,
    p_exchange_rate: exchangeRate,
    p_payment_source_type: type,
    p_payment_source_id: sourceId,
    p_payment_account_id: payment.accountId,
    p_evidence_document_id: text(payload.evidence_document_id, 80) || null,
    p_evidence_checksum: text(payload.evidence_checksum, 128) || null,
    p_lines: lines,
    p_journal_lines: journalLines(lines, payment.accountId),
    p_created_by: createdBy,
    p_idempotency_key: key,
  });
  if (result.error) throw new Error(`Paid expense receipt posting failed: ${result.error.message}`);

  return {
    success: true,
    ...(result.data || {}),
    accounting_effect: "PAID_EXPENSE_POSTED",
    payable_created: false,
  };
}

export default { manifest, validate, authorize, execute };
