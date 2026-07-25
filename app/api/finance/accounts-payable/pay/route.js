export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { processVendorPaymentCommand } from "@/lib/finance/payments/runtime/FinancePaymentApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (
    normalized.includes("required") ||
    normalized.includes("must be") ||
    normalized.includes("exceeds") ||
    normalized.includes("currency") ||
    normalized.includes("payment hold") ||
    normalized.includes("already paid") ||
    normalized.includes("idempotency")
  ) {
    return 400;
  }
  return 500;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organizationId = required(
      body.organizationId || body.organization_id,
      "organization_id"
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request: req,
      requiredAnyPermission: [
        "finance.vendor-payments.create",
        "finance.accounts-payable.pay",
        "finance.*",
      ],
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityId = required(
      body.entityId || body.entity_id,
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

    const result = await processVendorPaymentCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      accounts_payable_id: required(
        body.accounts_payable_id || body.accountsPayableId,
        "accounts_payable_id"
      ),
      amount: body.amount,
      bank_account_id: required(
        body.bank_account_id || body.bankAccountId,
        "bank_account_id"
      ),
      payment_method: body.payment_method || body.paymentMethod || "BANK_TRANSFER",
      reference_number: body.reference_number || body.referenceNumber || null,
      paid_by: access.user?.id,
      paid_at: body.paid_at || body.paidAt || null,
      currency_code: body.currency_code || body.currencyCode || null,
      exchange_rate: body.exchange_rate ?? body.exchangeRate ?? null,
      idempotency_key: required(
        body.idempotency_key ||
        body.idempotencyKey ||
        req.headers.get("idempotency-key"),
        "idempotency_key"
      ),
    });

    const status = result?.success === false
      ? statusFor(result.error)
      : 200;

    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: statusFor(error.message) }
    );
  }
}
