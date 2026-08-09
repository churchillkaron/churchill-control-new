export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { issueCustomerCreditNoteCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  return /required|greater than|exceeds|not found|scope|posted|creditable|uuid/i.test(String(message || "")) ? 400 : 500;
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

    const result = await issueCustomerCreditNoteCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: required(body.party_id || body.partyId, "party_id"),
      source_invoice_id: required(body.source_invoice_id || body.sourceInvoiceId, "source_invoice_id"),
      credit_date: required(body.credit_date || body.creditDate, "credit_date"),
      amount: body.amount,
      reason: body.reason || null,
      prefix: body.prefix || "CN",
      created_by: required(access.user?.id, "authenticated user"),
      idempotency_key: required(
        body.idempotency_key || body.idempotencyKey || request.headers.get("idempotency-key"),
        "idempotency_key"
      ),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error.message || "Customer credit note failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
