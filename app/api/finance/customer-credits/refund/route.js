export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { refundCustomerCreditCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  return /required|greater than|exceeds|not found|scope|currency|balanced|uuid/i.test(String(message || "")) ? 400 : 500;
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

    const entityId = required(body.entity_id || body.entityId, "entity_id");
    const entity = await resolveEntity({ organizationId: access.organizationId, entityId });

    if (!entity) {
      return NextResponse.json({ success: false, error: "Legal entity not found in organisation" }, { status: 404 });
    }

    const result = await refundCustomerCreditCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: required(body.party_id || body.partyId, "party_id"),
      customer_credit_id: required(body.customer_credit_id || body.customerCreditId, "customer_credit_id"),
      bank_account_id: required(body.bank_account_id || body.bankAccountId, "bank_account_id"),
      refund_date: required(body.refund_date || body.refundDate, "refund_date"),
      amount: body.amount,
      reference_number: body.reference_number || body.referenceNumber || null,
      currency_code: required(body.currency_code || body.currencyCode, "currency_code"),
      exchange_rate: body.exchange_rate ?? body.exchangeRate ?? 1,
      refunded_by: required(access.user?.id, "authenticated user"),
      idempotency_key: required(
        body.idempotency_key || body.idempotencyKey || request.headers.get("idempotency-key"),
        "idempotency_key"
      ),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error.message || "Customer credit refund failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
