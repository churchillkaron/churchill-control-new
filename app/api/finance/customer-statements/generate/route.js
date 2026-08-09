export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { generateCustomerStatementCommand } from "@/lib/finance/accounts-receivable/runtime/CustomerAccountApplicationService";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
    });

    if (!entity) {
      return errorResponse("Legal entity not found in organisation", 404);
    }

    const statement = await generateCustomerStatementCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: body.partyId || body.party_id,
      statement_id: body.statementId || body.statement_id,
      statement_date: body.statementDate || body.statement_date,
      period_start: body.periodStart || body.period_start,
      period_end: body.periodEnd || body.period_end,
      currency_code: body.currencyCode || body.currency_code,
      generated_by: access.user?.id || null,
      idempotency_key:
        body.idempotencyKey ||
        body.idempotency_key ||
        request.headers.get("idempotency-key"),
      prefix: body.prefix || "STAT",
    });

    return NextResponse.json({ success: true, statement });
  } catch (error) {
    const message = error?.message || "Unable to generate customer statement";
    const status = /required|uuid|not found|period|currency/i.test(message)
      ? 400
      : 500;
    return errorResponse(message, status);
  }
}
