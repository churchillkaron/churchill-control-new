import postCustomerPayment from "@/lib/finance/accounts-receivable/capabilities/postCustomerPayment";
import postCustomerPrepayment from "@/lib/finance/accounts-receivable/capabilities/postCustomerPrepayment";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameMoney(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) < 0.005;
}

export async function finalizeCustomerPortalCardPayment({ event, session }) {
  const requestId = text(session?.metadata?.portalPaymentRequestId);
  const organizationId = text(session?.metadata?.organizationId);
  const partyId = text(session?.metadata?.partyId);
  if (!requestId || !organizationId || !partyId) throw new Error("CUSTOMER_PORTAL_PAYMENT_METADATA_REQUIRED");
  if (session.payment_status !== "paid") return { skipped: true, reason: "NOT_PAID" };

  const paymentRequestResult = await supabaseAdmin.from("customer_portal_payment_requests")
    .select("*")
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (paymentRequestResult.error) throw paymentRequestResult.error;
  const request = paymentRequestResult.data;
  if (!request) throw new Error("CUSTOMER_PORTAL_PAYMENT_REQUEST_NOT_FOUND");
  if (request.status === "PAID") return { idempotent_replay: true, payment_request: request };
  if (!request.bank_account_id) throw new Error("CUSTOMER_PORTAL_SETTLEMENT_BANK_REQUIRED");

  const currency = text(request.currency_code).toLowerCase();
  if (text(session.currency).toLowerCase() !== currency) throw new Error("CUSTOMER_PORTAL_STRIPE_CURRENCY_MISMATCH");
  const stripeAmount = Number(session.amount_total || 0) / (["bif","clp","djf","gnf","jpy","kmf","krw","mga","pyg","rwf","ugx","vnd","vuv","xaf","xof","xpf"].includes(currency) ? 1 : 100);
  if (!sameMoney(stripeAmount, request.amount)) throw new Error("CUSTOMER_PORTAL_STRIPE_AMOUNT_MISMATCH");

  let financeResult = null;
  if (request.source_type === "CUSTOMER_INVOICE") {
    const invoiceResult = await supabaseAdmin.from("customer_invoices")
      .select("id,organization_id,entity_id,party_id,status,outstanding_balance,outstanding_amount,total_amount,currency_code,exchange_rate")
      .eq("organization_id", organizationId)
      .eq("id", request.source_id)
      .maybeSingle();
    if (invoiceResult.error) throw invoiceResult.error;
    const invoice = invoiceResult.data;
    if (!invoice || invoice.party_id !== partyId || invoice.entity_id !== request.entity_id) throw new Error("CUSTOMER_PORTAL_INVOICE_SCOPE_MISMATCH");
    const outstanding = amount(invoice.outstanding_balance ?? invoice.outstanding_amount ?? invoice.total_amount);
    if (!sameMoney(outstanding, request.amount)) throw new Error("CUSTOMER_PORTAL_INVOICE_BALANCE_CHANGED");

    financeResult = await postCustomerPayment({
      organization_id: organizationId,
      entity_id: invoice.entity_id,
      party_id: partyId,
      customer_invoice_id: invoice.id,
      allocations: [{ customer_invoice_id: invoice.id, amount: Number(request.amount) }],
      payment_date: new Date().toISOString().slice(0, 10),
      amount: Number(request.amount),
      bank_account_id: request.bank_account_id,
      payment_method: "CARD",
      reference_number: text(session.payment_intent) || session.id,
      paid_by: null,
      system_automation: true,
      currency_code: text(invoice.currency_code).toUpperCase(),
      exchange_rate: Number(invoice.exchange_rate || 1),
      idempotency_key: `customer-portal-stripe:${request.id}`,
    });
  } else if (request.source_type === "SERVICE_BOOKING") {
    financeResult = await postCustomerPrepayment({
      organization_id: organizationId,
      entity_id: request.entity_id,
      party_id: partyId,
      payment_date: new Date().toISOString().slice(0, 10),
      amount: Number(request.amount),
      bank_account_id: request.bank_account_id,
      payment_method: "CARD",
      reference_number: text(session.payment_intent) || session.id,
      received_by: null,
      system_automation: true,
      currency_code: text(request.currency_code).toUpperCase(),
      exchange_rate: 1,
      idempotency_key: `customer-portal-booking-prepayment:${request.id}`,
    });
  }

  const settled = await supabaseAdmin.from("customer_portal_payment_requests").update({
    status: "PAID",
    provider_payment_id: text(session.payment_intent) || null,
    provider_event_id: event.id,
    settled_at: new Date().toISOString(),
    metadata: {
      ...(request.metadata || {}),
      stripe_checkout_session_id: session.id,
      finance_payment_id: financeResult?.payment_id || null,
      settlement_verified: true,
    },
    updated_at: new Date().toISOString(),
  }).eq("organization_id", organizationId).eq("id", request.id).neq("status", "PAID").select("*").maybeSingle();
  if (settled.error) throw settled.error;
  return { idempotent_replay: false, payment_request: settled.data || request, finance: financeResult };
}

export async function failCustomerPortalCardPayment({ event, session, reason }) {
  const requestId = text(session?.metadata?.portalPaymentRequestId);
  const organizationId = text(session?.metadata?.organizationId);
  if (!requestId || !organizationId) return;
  const result = await supabaseAdmin.from("customer_portal_payment_requests").update({
    status: "FAILED",
    provider_event_id: event.id,
    metadata: { failure_reason: reason },
    updated_at: new Date().toISOString(),
  }).eq("organization_id", organizationId).eq("id", requestId).eq("status", "CHECKOUT_CREATED");
  if (result.error) throw result.error;
}
