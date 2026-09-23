export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { localDateString, resolveOrganizationTimeContext } from "@/lib/shared/time/organizationTime";
import { applyCustomerPrepaymentSystemCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";
import { CUSTOMER_PORTAL_COOKIE, isCustomerPortalSameOriginRequest, resolveCustomerPortalSession } from "@/lib/customer-portal/CustomerPortalRuntime";

const BALANCE_TYPES = new Set(["PREPAYMENT", "CUSTOMER_CREDIT"]);

function positive(value, field) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${field} must be greater than zero`);
  return amount;
}

function text(value) {
  return String(value ?? "").trim();
}

async function loadWalletSource({ session, balanceType, walletEntryId }) {
  if (balanceType === "PREPAYMENT") {
    const result = await supabaseAdmin.from("finance_customer_unapplied_cash")
      .select("id,entity_id,party_id,customer_payment_id,available_amount,currency_code,status")
      .eq("organization_id", session.organization_id)
      .eq("party_id", session.party_id)
      .eq("id", walletEntryId)
      .gt("available_amount", 0)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error("Available prepayment not found in portal scope");
    return { ...result.data, balance_type: "PREPAYMENT" };
  }

  const result = await supabaseAdmin.from("finance_customer_credits")
    .select("id,entity_id,party_id,available_amount,currency_code,status")
    .eq("organization_id", session.organization_id)
    .eq("party_id", session.party_id)
    .eq("id", walletEntryId)
    .gt("available_amount", 0)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Available customer credit not found in portal scope");
  return { ...result.data, balance_type: "CUSTOMER_CREDIT" };
}

async function recordPortalWalletEvent({ session, invoice, source, amount, applicationDate, idempotencyKey }) {
  const eventResult = await supabaseAdmin.rpc("record_system_event_atomic", {
    p_organization_id: session.organization_id,
    p_type: "CUSTOMER_PORTAL_WALLET_APPLIED",
    p_payload: {
      source: "customer_portal",
      customer_portal_session_id: session.id,
      party_id: session.party_id,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number || null,
      wallet_entry_id: source.id,
      wallet_balance_type: source.balance_type,
      customer_payment_id: source.customer_payment_id || null,
      customer_credit_id: source.balance_type === "CUSTOMER_CREDIT" ? source.id : null,
      amount,
      currency_code: source.currency_code,
      application_date: applicationDate,
      customer_attributed: true,
    },
    p_idempotency_key: `${idempotencyKey}:portal-event`,
  });
  if (eventResult.error) {
    console.error("CUSTOMER_PORTAL_WALLET_EVENT_FAILED", eventResult.error);
    return { recorded: false, error: eventResult.error.message || "Wallet event recording failed" };
  }
  return { recorded: true, error: null };
}

export async function POST(request) {
  try {
    if (!isCustomerPortalSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: "Cross-origin customer portal mutation denied" }, { status: 403 });
    }
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const invoiceId = text(body?.invoiceId || body?.invoice_id);
    const legacyPrepaymentId = text(body?.prepaymentId || body?.prepayment_id);
    const legacyCustomerCreditId = text(body?.customerCreditId || body?.customer_credit_id);
    const walletEntryId = text(body?.walletEntryId || body?.wallet_entry_id || legacyPrepaymentId || legacyCustomerCreditId);
    const balanceType = text(
      body?.balanceType || body?.balance_type || (legacyCustomerCreditId ? "CUSTOMER_CREDIT" : "PREPAYMENT"),
    ).toUpperCase();

    if (!invoiceId || !walletEntryId) {
      return NextResponse.json({ success: false, error: "invoiceId and walletEntryId required" }, { status: 400 });
    }
    if (!BALANCE_TYPES.has(balanceType)) {
      return NextResponse.json({ success: false, error: "balanceType must be PREPAYMENT or CUSTOMER_CREDIT" }, { status: 400 });
    }

    const [invoiceResult, source] = await Promise.all([
      supabaseAdmin.from("customer_invoices")
        .select("id,entity_id,party_id,currency_code,outstanding_balance,status,invoice_number")
        .eq("organization_id", session.organization_id)
        .eq("party_id", session.party_id)
        .eq("id", invoiceId)
        .gt("outstanding_balance", 0)
        .maybeSingle(),
      loadWalletSource({ session, balanceType, walletEntryId }),
    ]);
    if (invoiceResult.error) throw invoiceResult.error;
    if (!invoiceResult.data) throw new Error("Open customer invoice not found in portal scope");

    const invoice = invoiceResult.data;
    if (invoice.entity_id !== source.entity_id) throw new Error("Wallet balance and invoice must belong to the same Legal Entity");
    if (String(invoice.currency_code || "").toUpperCase() !== String(source.currency_code || "").toUpperCase()) {
      throw new Error("Wallet balance currency must match invoice currency");
    }

    const requestedAmount = body?.amount == null
      ? Math.min(Number(invoice.outstanding_balance || 0), Number(source.available_amount || 0))
      : positive(body.amount, "amount");
    const amount = positive(requestedAmount, "amount");
    if (amount > Number(invoice.outstanding_balance || 0) + 0.005) throw new Error("Amount exceeds invoice outstanding balance");
    if (amount > Number(source.available_amount || 0) + 0.005) throw new Error("Amount exceeds available wallet balance");

    const timeContext = await resolveOrganizationTimeContext({
      organizationId: session.organization_id,
      entityId: invoice.entity_id,
    });
    const applicationDate = localDateString(new Date(), timeContext.timezone || "UTC");
    const idempotencyKey = text(body?.idempotencyKey || body?.idempotency_key)
      || `customer-portal:wallet:${session.id}:${balanceType}:${source.id}:${invoice.id}:${randomUUID()}`;

    let result;
    if (balanceType === "PREPAYMENT") {
      result = await applyCustomerPrepaymentSystemCommand({
        organization_id: session.organization_id,
        entity_id: invoice.entity_id,
        party_id: session.party_id,
        payment_id: source.customer_payment_id,
        customer_invoice_id: invoice.id,
        application_date: applicationDate,
        amount,
        idempotency_key: idempotencyKey,
      });
    } else {
      const applied = await supabaseAdmin.rpc("finance_apply_customer_credit_portal_idempotent", {
        p_organization_id: session.organization_id,
        p_entity_id: invoice.entity_id,
        p_party_id: session.party_id,
        p_customer_credit_id: source.id,
        p_target_invoice_id: invoice.id,
        p_amount: amount,
        p_portal_session_id: session.id,
        p_idempotency_key: idempotencyKey,
      });
      if (applied.error) throw applied.error;
      result = applied.data;
    }

    const audit = await recordPortalWalletEvent({
      session,
      invoice,
      source,
      amount,
      applicationDate,
      idempotencyKey,
    });

    const response = NextResponse.json({
      success: true,
      balance_type: balanceType,
      result,
      portal_audit: audit,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to apply wallet balance" }, { status: 400 });
  }
}
