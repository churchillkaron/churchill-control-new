export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { postCustomerPaymentCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

function statusFor(message) {
  return /required|greater than|exceeds|match|currency|allocation|idempotency|uuid|outstanding|another customer/i.test(
    String(message || "")
  )
    ? 400
    : 500;
}

function resolvePartyId(body) {
  const customer = body.customer;

  return (
    body.party_id ||
    body.partyId ||
    customer?.party_id ||
    customer?.partyId ||
    null
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityId = required(
      body.entity_id || body.entityId,
      "entity_id"
    );
    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      );
    }

    const idempotencyKey = required(
      body.idempotency_key ||
        body.idempotencyKey ||
        request.headers.get("idempotency-key"),
      "idempotency_key"
    );
    const actorId = required(
      access.user?.id,
      "authenticated user"
    );
    const partyId = required(
      resolvePartyId(body),
      "party_id"
    );
    const allocations = Array.isArray(body.allocations)
      ? body.allocations
      : body.customer_invoice_id || body.customerInvoiceId
        ? [
            {
              customer_invoice_id:
                body.customer_invoice_id || body.customerInvoiceId,
              amount: body.amount,
            },
          ]
        : [];

    const result = await postCustomerPaymentCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: partyId,
      customer_invoice_id:
        body.customer_invoice_id || body.customerInvoiceId || null,
      allocations,
      payment_date:
        body.payment_date || body.paymentDate,
      amount: body.amount,
      bank_account_id:
        body.bank_account_id || body.bankAccountId,
      payment_method:
        body.payment_method || body.paymentMethod,
      reference_number:
        body.reference_number || body.referenceNumber || null,
      currency_code:
        body.currency_code || body.currencyCode,
      exchange_rate:
        body.exchange_rate ?? body.exchangeRate,
      paid_by: actorId,
      idempotency_key: idempotencyKey,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error.message || "Customer receipt failed";

    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
