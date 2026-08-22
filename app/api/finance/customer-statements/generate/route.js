export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { generateCustomerStatementCommand } from "@/lib/finance/accounts-receivable/runtime/CustomerAccountApplicationService";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

function statementIdempotencyKey({ organizationId, entityId, partyId, periodStart, periodEnd, currencyCode }) {
  return [
    "customer-statement",
    organizationId,
    entityId,
    partyId,
    periodStart,
    periodEnd,
    String(currencyCode || "").trim().toUpperCase(),
  ].join(":");
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

    const partyId = body.partyId || body.party_id;
    const periodStart = body.periodStart || body.period_start;
    const periodEnd = body.periodEnd || body.period_end;
    const currencyCode = body.currencyCode || body.currency_code;
    const idempotencyKey =
      body.idempotencyKey ||
      body.idempotency_key ||
      request.headers.get("idempotency-key") ||
      statementIdempotencyKey({
        organizationId: access.organizationId,
        entityId: entity.id,
        partyId,
        periodStart,
        periodEnd,
        currencyCode,
      });

    const statement = await generateCustomerStatementCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: partyId,
      statement_id: body.statementId || body.statement_id,
      statement_date: body.statementDate || body.statement_date,
      period_start: periodStart,
      period_end: periodEnd,
      currency_code: currencyCode,
      generated_by: access.user?.id || null,
      idempotency_key: idempotencyKey,
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
