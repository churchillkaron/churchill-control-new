import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { postCustomerPaymentCommand } from "../runtime/AccountsReceivableApplicationService";

const REQUIRED_PERMISSION = "finance.receivables.manage";

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function actorId(context = {}) {
  return text(context.actor?.id || context.actor?.user_id || context.metadata?.actorId);
}

export const manifest = defineCapability({
  domain: "finance",
  capability: "customer_receipt",
  action: "post",
  name: "Record customer receipt",
  description: "Record payment of an existing customer invoice into an active bank account, allocate the receipt, verify the invoice balance, and return the paid receipt PDF.",
  permissions: [REQUIRED_PERMISSION],
  events: ["finance.customer_receipt.posted"],
  tags: ["finance", "accounts_receivable", "invoice", "payment", "receipt"],
  transactional: true,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "approve",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  risk: "high",
  reversible: true,
  contextScope: "entity",  operatorAliases: [
    "mark invoice paid",
    "mark the invoice paid",
    "record invoice payment",
    "record customer payment",
    "receive customer payment",
    "post customer receipt",
    "send paid receipt",
    "get paid receipt",
  ],
  operatorExamples: [
    "Mark invoice INV-26090001 paid on 8 Sep 2026",
    "Mark the latest invoice paid and give me the receipt",
    "Record this invoice as paid to the bank account",
  ],
  inputSchema: {
    type: "object",
    properties: {
      customer_invoice_id: { type: "string", description: "Existing invoice id when already resolved from business evidence." },
      invoice_number: { type: "string", description: "Existing customer invoice number, for example INV-26090001." },
      latest_open_invoice: { type: "boolean", description: "True only when the user explicitly asked for the latest open customer invoice in the active entity." },
      payment_date: { type: "string", description: "Actual payment date in YYYY-MM-DD format." },
      amount: { type: "number", description: "Payment amount. Defaults to the invoice outstanding balance." },
      bank_account_id: { type: "string", description: "Receiving bank account id. Defaults to the single active default bank account for the invoice currency." },
      payment_method: { type: "string", description: "Payment method. Defaults to BANK_TRANSFER when posting to a bank account." },
      reference_number: { type: "string", description: "Optional bank/payment reference." },
    },
    required: ["payment_date"],
    additionalProperties: false,
  },
});

export function validate({ context, payload = {} }) {
  if (!text(context?.organizationId)) throw new Error("organization_id required");
  if (!text(context?.entityId)) throw new Error("entity_id required");
  if (!actorId(context)) throw new Error("authenticated actor required");
  if (!text(payload.payment_date || payload.paymentDate)) throw new Error("payment_date required");
  if (
    !text(payload.customer_invoice_id || payload.customerInvoiceId || payload.invoice_number || payload.invoiceNumber) &&
    payload.latest_open_invoice !== true &&
    payload.latestOpenInvoice !== true
  ) {
    throw new Error("invoice number, invoice id, or explicit latest open invoice selector required");
  }
  return true;
}

export function authorize({ context }) {
  return requireExecutionPermission(context, REQUIRED_PERMISSION);
}async function resolveInvoice({ organizationId, entityId, payload }) {
  const invoiceId = text(payload.customer_invoice_id || payload.customerInvoiceId);
  const invoiceNumber = text(payload.invoice_number || payload.invoiceNumber);
  let query = supabaseAdmin
    .from("customer_invoices")
    .select("id,invoice_number,party_id,status,outstanding_balance,outstanding_amount,total_amount,currency_code,exchange_rate")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId);

  let result;
  if (invoiceId) {
    result = await query.eq("id", invoiceId).maybeSingle();
  } else if (invoiceNumber) {
    result = await query.eq("invoice_number", invoiceNumber).maybeSingle();
  } else {
    result = await query
      .in("status", ["OPEN", "PARTIAL"])
      .gt("outstanding_balance", 0.005)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Customer invoice not found in the active entity");

  const invoice = result.data;
  const outstanding = number(invoice.outstanding_balance ?? invoice.outstanding_amount);
  if (!outstanding || outstanding <= 0.005 || text(invoice.status).toUpperCase() === "PAID") {
    throw new Error("Customer invoice has no outstanding balance");
  }
  if (!text(invoice.party_id)) throw new Error("Customer invoice party is missing");
  return { invoice, outstanding };
}

async function resolveBankAccount({ organizationId, entityId, currencyCode, requestedId }) {
  let query = supabaseAdmin
    .from("bank_accounts")
    .select("id,bank_name,account_name,currency,currency_code,active,is_default,finance_account_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("active", true);

  if (requestedId) query = query.eq("id", requestedId);
  else query = query.eq("is_default", true);

  const result = await query;
  if (result.error) throw result.error;
  const matching = (result.data || []).filter((row) => {
    const bankCurrency = text(row.currency_code || row.currency).toUpperCase();
    return !bankCurrency || bankCurrency === currencyCode;
  });
  if (matching.length !== 1) {
    throw new Error(requestedId ? "Receiving bank account is unavailable" : "Select the receiving bank account");
  }
  if (!text(matching[0].finance_account_id)) throw new Error("Receiving bank account is not mapped to Finance GL");
  return matching[0];
}export async function execute({ context, payload = {} }) {
  const organizationId = text(context.organizationId);
  const entityId = text(context.entityId);
  const paidBy = actorId(context);
  const paymentDate = text(payload.payment_date || payload.paymentDate);
  const { invoice, outstanding } = await resolveInvoice({ organizationId, entityId, payload });
  const currencyCode = text(invoice.currency_code || "THB").toUpperCase();
  const paymentAmount = number(payload.amount) ?? outstanding;

  if (!paymentAmount || paymentAmount <= 0) throw new Error("payment amount must be greater than zero");
  if (paymentAmount > outstanding + 0.005) throw new Error("Payment amount exceeds invoice outstanding balance");

  const bank = await resolveBankAccount({
    organizationId,
    entityId,
    currencyCode,
    requestedId: text(payload.bank_account_id || payload.bankAccountId),
  });
  const exchangeRate = number(invoice.exchange_rate) || 1;
  const idempotencyKey = [
    "operator-customer-receipt-v1",
    organizationId,
    entityId,
    invoice.id,
    paymentDate,
    paymentAmount.toFixed(2),
    bank.id,
  ].join(":");

  const result = await postCustomerPaymentCommand({
    organization_id: organizationId,
    entity_id: entityId,
    party_id: invoice.party_id,
    customer_invoice_id: invoice.id,
    allocations: [{ customer_invoice_id: invoice.id, amount: paymentAmount }],
    payment_date: paymentDate,
    amount: paymentAmount,
    bank_account_id: bank.id,
    payment_method: text(payload.payment_method || payload.paymentMethod) || "BANK_TRANSFER",
    reference_number: text(payload.reference_number || payload.referenceNumber) || null,
    currency_code: currencyCode,
    exchange_rate: exchangeRate,
    paid_by: paidBy,
    idempotency_key: idempotencyKey,
  });

  const verification = await supabaseAdmin
    .from("customer_invoices")
    .select("id,invoice_number,status,outstanding_balance,outstanding_amount,total_amount,currency_code")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", invoice.id)
    .maybeSingle();
  if (verification.error) throw verification.error;

  const verifiedInvoice = verification.data;
  const remaining = number(verifiedInvoice?.outstanding_balance ?? verifiedInvoice?.outstanding_amount) ?? Infinity;
  const paid = text(verifiedInvoice?.status).toUpperCase() === "PAID" && remaining <= 0.005;
  if (!paid) throw new Error("Customer receipt posted but paid status was not independently verified");

  return {
    success: true,
    ...result,
    invoice: verifiedInvoice,
    receipt_verification: { verified: true, invoice: verifiedInvoice },
    artifacts: [{
      url: `/api/finance/customer-invoices/${invoice.id}/pdf?organizationId=${organizationId}&entityId=${entityId}&mode=receipt`,
      label: `Paid Receipt PDF · ${verifiedInvoice.invoice_number || invoice.id}`,
      mime_type: "application/pdf",
      asset_id: invoice.id,
    }],
  };
}

export default { manifest, validate, authorize, execute };