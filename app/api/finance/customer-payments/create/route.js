export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { postCustomerPaymentCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|greater than|exceeds|match|currency|allocation|idempotency|uuid|outstanding|another customer/i.test(normalized)
    ? 400
    : 500;
}

function resolvePartyId(body) {
  const customer = body.customer;
  return body.party_id || body.partyId || customer?.party_id || customer?.partyId || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const actorId = required(access.user?.id, "authenticated user");
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.receivables.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId = required(body.entity_id || body.entityId, "entity_id");
    const entity = await resolveEntity({ organizationId: access.organizationId, entityId });
    if (!entity) {
      return NextResponse.json({ success: false, error: "Legal entity not found in organisation" }, { status: 404 });
    }

    const idempotencyKey = required(
      body.idempotency_key || body.idempotencyKey || request.headers.get("idempotency-key"),
      "idempotency_key"
    );
    const partyId = required(resolvePartyId(body), "party_id");
    const allocations = Array.isArray(body.allocations)
      ? body.allocations
      : body.customer_invoice_id || body.customerInvoiceId
        ? [{ customer_invoice_id: body.customer_invoice_id || body.customerInvoiceId, amount: body.amount }]
        : [];

    const result = await postCustomerPaymentCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: partyId,
      customer_invoice_id: body.customer_invoice_id || body.customerInvoiceId || null,
      allocations,
      payment_date: body.payment_date || body.paymentDate,
      amount: body.amount,
      bank_account_id: body.bank_account_id || body.bankAccountId,
      payment_method: body.payment_method || body.paymentMethod,
      reference_number: body.reference_number || body.referenceNumber || null,
      currency_code: body.currency_code || body.currencyCode,
      exchange_rate: body.exchange_rate ?? body.exchangeRate,
      paid_by: actorId,
      idempotency_key: idempotencyKey,
    });

    const exactInvoiceId = allocations.length === 1
      ? String(allocations[0]?.customer_invoice_id || "").trim()
      : "";
    let verifiedInvoice = null;
    if (exactInvoiceId) {
      const verification = await supabaseAdmin
        .from("customer_invoices")
        .select("id,invoice_number,status,outstanding_balance,total_amount")
        .eq("organization_id", access.organizationId)
        .eq("entity_id", entity.id)
        .eq("id", exactInvoiceId)
        .maybeSingle();
      if (verification.error) throw verification.error;
      verifiedInvoice = verification.data || null;
    }
    const receiptVerified = Boolean(
      verifiedInvoice &&
      String(verifiedInvoice.status || "").toUpperCase() === "PAID" &&
      Number(verifiedInvoice.outstanding_balance || 0) <= 0.005
    );
    const artifacts = receiptVerified
      ? [{
          url: `/api/finance/customer-invoices/${exactInvoiceId}/pdf?organizationId=${access.organizationId}&entityId=${entity.id}&mode=receipt`,
          label: `Paid Receipt PDF · ${verifiedInvoice.invoice_number || exactInvoiceId}`,
          mime_type: "application/pdf",
          asset_id: exactInvoiceId,
        }]
      : [];

    return NextResponse.json({
      success: true,
      ...result,
      receipt_verification: exactInvoiceId
        ? { verified: receiptVerified, invoice: verifiedInvoice }
        : null,
      artifacts,
    });
  } catch (error) {
    const message = error.message || "Customer receipt failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
