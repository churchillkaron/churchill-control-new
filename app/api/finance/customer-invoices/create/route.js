export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { createCustomerInvoiceCommand } from "@/lib/finance/accounts-receivable/runtime/AccountsReceivableApplicationService";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (normalized.includes("required") || normalized.includes("must be") || normalized.includes("idempotency")) return 400;
  return 500;
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

    const actorId = String(access.user?.id || "").trim();
    if (!actorId) throw new Error("authenticated user required");

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.receivables.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId = String(body.entityId || body.entity_id || "").trim();
    if (!entityId) throw new Error("entity_id required");

    const entity = await resolveEntity({ organizationId: access.organizationId, entityId });
    if (!entity) {
      return NextResponse.json({ success: false, error: "Entity is outside organization scope" }, { status: 403 });
    }

    const currencyCode = String(body.currency_code || body.currency || entity.currency || "").trim().toUpperCase();
    const idempotencyKey = String(body.idempotency_key || body.idempotencyKey || request.headers.get("idempotency-key") || "").trim();

    if (!currencyCode) throw new Error("currency_code required");
    if (!idempotencyKey) throw new Error("idempotency_key required");

    const result = await createCustomerInvoiceCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: body.party_id || body.partyId,
      invoice_date: body.invoice_date,
      due_date: body.due_date,
      currency_code: currencyCode,
      exchange_rate: body.exchange_rate ?? 1,
      lines: Array.isArray(body.lines) ? body.lines : [],
      tax_amount: body.tax_amount,
      notes: body.notes,
      created_by: actorId,
      idempotency_key: idempotencyKey,
      document_prefix: body.document_prefix || body.invoice_prefix || "INV",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Customer invoice creation failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
