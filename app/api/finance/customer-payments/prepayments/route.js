export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  applyCustomerPrepaymentCommand,
  refundCustomerPrepaymentCommand,
} from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function positive(value, field) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
  return normalized;
}

function dateOnly(value, field) {
  const normalized = required(value, field).slice(0, 10);
  const candidate = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())) throw new Error(`${field} must be a valid date`);
  return candidate.toISOString().slice(0, 10);
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (normalized.includes("not found")) return 404;
  return /required|greater than|exceeds|currency|invoice|bank|available|balance|uuid|idempotency|different customer|selected legal entity/i.test(normalized)
    ? 400
    : 500;
}

async function resolveAccess({ request, organizationId, permissionKey }) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      ),
    };
  }

  const actorId = required(access.user?.id, "authenticated user");
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: actorId,
    permissionKey,
    fullAccess: access.permissions?.includes("*") === true,
  });

  return { access, actorId };
}

async function resolveLegalEntity({ organizationId, entityId }) {
  const resolvedEntityId = required(entityId, "entity_id");
  const entity = await resolveEntity({
    organizationId,
    entityId: resolvedEntityId,
  });
  if (!entity) throw new Error("Legal entity not found in organisation");
  return entity;
}

async function loadUnappliedCash({ organizationId, entityId, cashId }) {
  let query = supabaseAdmin
    .from("finance_customer_unapplied_cash")
    .select(
      "id,organization_id,entity_id,party_id,customer_id,customer_payment_id,original_amount,available_amount,currency_code,exchange_rate,status,received_at,refunded_amount"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId);

  if (cashId) query = query.eq("id", cashId);

  const result = cashId
    ? await query.maybeSingle()
    : await query.gt("available_amount", 0).order("received_at", { ascending: false });

  if (result.error) throw result.error;
  if (cashId && !result.data) throw new Error("Customer prepayment balance not found");
  return result.data;
}

async function loadOpenInvoice({ organizationId, entityId, invoiceId, partyId }) {
  const { data, error } = await supabaseAdmin
    .from("customer_invoices")
    .select("id,invoice_number,party_id,entity_id,currency_code,outstanding_balance,status,due_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("party_id", partyId)
    .eq("id", invoiceId)
    .gt("outstanding_balance", 0)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Open customer invoice not found for this prepayment customer");
  return data;
}

async function loadSettlementBank({ organizationId, entityId, bankAccountId }) {
  const { data, error } = await supabaseAdmin
    .from("bank_accounts")
    .select("id,bank_name,account_name,account_number,currency,currency_code,active,finance_account_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", bankAccountId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.active === false) {
    throw new Error("Settlement bank account not found or inactive for the selected Legal Entity");
  }
  if (!data.finance_account_id) {
    throw new Error("Settlement bank account is not linked to a Finance ledger account");
  }
  return data;
}

async function loadWorkspaceData({ organizationId, entityId }) {
  const cash = await loadUnappliedCash({ organizationId, entityId });
  const paymentIds = [...new Set((cash || []).map((row) => row.customer_payment_id).filter(Boolean))];

  let payments = [];
  if (paymentIds.length) {
    const result = await supabaseAdmin
      .from("customer_payments")
      .select("id,payment_number,reference_number,payment_date,payment_method,party_id,currency_code,amount")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .in("id", paymentIds);
    if (result.error) throw result.error;
    payments = result.data || [];
  }

  const invoiceResult = await supabaseAdmin
    .from("customer_invoices")
    .select("id,invoice_number,party_id,currency_code,outstanding_balance,status,due_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .gt("outstanding_balance", 0)
    .order("due_date", { ascending: true });
  if (invoiceResult.error) throw invoiceResult.error;

  const bankResult = await supabaseAdmin
    .from("bank_accounts")
    .select("id,bank_name,account_name,account_number,currency,currency_code,is_default,active,finance_account_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("active", true)
    .not("finance_account_id", "is", null)
    .order("is_default", { ascending: false })
    .order("bank_name", { ascending: true });
  if (bankResult.error) throw bankResult.error;

  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

  return {
    prepayments: (cash || []).map((row) => ({
      ...row,
      payment: paymentById.get(row.customer_payment_id) || null,
    })),
    invoices: invoiceResult.data || [],
    bank_accounts: bankResult.data || [],
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");
    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");

    const resolved = await resolveAccess({
      request,
      organizationId,
      permissionKey: "finance.receivables.view",
    });
    if (resolved.response) return resolved.response;

    const entity = await resolveLegalEntity({
      organizationId: resolved.access.organizationId,
      entityId,
    });

    const data = await loadWorkspaceData({
      organizationId: resolved.access.organizationId,
      entityId: entity.id,
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    const message = error.message || "Customer prepayment management could not be loaded";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const operation = required(body.operation, "operation").toLowerCase();
    if (!new Set(["apply", "refund"]).has(operation)) {
      throw new Error("operation must be apply or refund");
    }

    const resolved = await resolveAccess({
      request,
      organizationId: body.organizationId || body.organization_id,
      permissionKey: "finance.receivables.manage",
    });
    if (resolved.response) return resolved.response;

    const entity = await resolveLegalEntity({
      organizationId: resolved.access.organizationId,
      entityId: body.entityId || body.entity_id,
    });

    const cash = await loadUnappliedCash({
      organizationId: resolved.access.organizationId,
      entityId: entity.id,
      cashId: required(body.prepayment_id || body.prepaymentId, "prepayment_id"),
    });

    const amount = positive(body.amount, "amount");
    if (amount > Number(cash.available_amount || 0)) {
      throw new Error("Amount exceeds available customer prepayment balance");
    }

    const idempotencyKey = required(
      body.idempotency_key || body.idempotencyKey || request.headers.get("idempotency-key"),
      "idempotency_key"
    );

    let result;
    if (operation === "apply") {
      const invoice = await loadOpenInvoice({
        organizationId: resolved.access.organizationId,
        entityId: entity.id,
        invoiceId: required(body.customer_invoice_id || body.customerInvoiceId, "customer_invoice_id"),
        partyId: cash.party_id,
      });

      if (amount > Number(invoice.outstanding_balance || 0)) {
        throw new Error("Amount exceeds customer invoice outstanding balance");
      }

      const cashCurrency = String(cash.currency_code || "").toUpperCase();
      const invoiceCurrency = String(invoice.currency_code || "").toUpperCase();
      if (cashCurrency && invoiceCurrency && cashCurrency !== invoiceCurrency) {
        throw new Error("Customer prepayment currency must match the invoice currency");
      }

      result = await applyCustomerPrepaymentCommand({
        organization_id: resolved.access.organizationId,
        entity_id: entity.id,
        party_id: cash.party_id,
        payment_id: cash.customer_payment_id,
        customer_invoice_id: invoice.id,
        application_date: dateOnly(body.application_date || body.applicationDate, "application_date"),
        amount,
        applied_by: resolved.actorId,
        idempotency_key: idempotencyKey,
      });
    } else {
      const bank = await loadSettlementBank({
        organizationId: resolved.access.organizationId,
        entityId: entity.id,
        bankAccountId: required(body.bank_account_id || body.bankAccountId, "bank_account_id"),
      });

      const cashCurrency = String(cash.currency_code || "").toUpperCase();
      const bankCurrency = String(bank.currency_code || bank.currency || "").toUpperCase();
      if (cashCurrency && bankCurrency && cashCurrency !== bankCurrency) {
        throw new Error("Settlement bank account currency must match the customer prepayment currency");
      }

      result = await refundCustomerPrepaymentCommand({
        organization_id: resolved.access.organizationId,
        entity_id: entity.id,
        party_id: cash.party_id,
        payment_id: cash.customer_payment_id,
        refund_date: dateOnly(body.refund_date || body.refundDate, "refund_date"),
        amount,
        bank_account_id: bank.id,
        reference_number: body.reference_number || body.referenceNumber || null,
        refunded_by: resolved.actorId,
        idempotency_key: idempotencyKey,
      });
    }

    const workspace = await loadWorkspaceData({
      organizationId: resolved.access.organizationId,
      entityId: entity.id,
    });

    return NextResponse.json({ success: true, operation, result, ...workspace });
  } catch (error) {
    const message = error.message || "Customer prepayment operation failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
