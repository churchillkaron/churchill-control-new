export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { reverseCustomerPaymentCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

function statusFor(message) {
  return /required|uuid|target_status|already|not found|no posted journal|balanced/i.test(
    String(message || "")
  )
    ? 400
    : 500;
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

    const paymentId = required(
      body.payment_id || body.paymentId,
      "payment_id"
    );
    const idempotencyKey = required(
      body.idempotency_key ||
        body.idempotencyKey ||
        request.headers.get("idempotency-key"),
      "idempotency_key"
    );
    const actorId = required(
      access.access?.staffAccountId ||
        access.staff?.id ||
        access.user?.id,
      "authenticated actor"
    );

    const result = await reverseCustomerPaymentCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      payment_id: paymentId,
      target_status:
        body.target_status || body.targetStatus || "REVERSED",
      actor_id: actorId,
      reason: body.reason || null,
      idempotency_key: idempotencyKey,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error.message || "Customer receipt reversal failed";

    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
