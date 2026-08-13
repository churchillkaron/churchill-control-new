export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${field} must be positive`);
  }
  return number;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|positive|invalid|unbalanced|period/i.test(normalized) ? 400 : 500;
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

    const actorId = required(access.user?.id, "authenticated user");
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.journals.post",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const idempotencyKey = required(
      body.idempotency_key ||
        body.idempotencyKey ||
        request.headers.get("idempotency-key"),
      "idempotency_key"
    );

    const result = await financeGateway({
      type: "DIRECT_JOURNAL_POST",
      payload: {
        organizationId: access.organizationId,
        entityId: required(body.entityId || body.entity_id, "entity_id"),
        postingDate: required(body.posting_date || body.postingDate, "posting_date"),
        documentDate: body.document_date || body.documentDate || null,
        journalType: body.journal_type || body.journalType || "GENERAL",
        reference: body.reference || null,
        sourceModule: body.source_module || body.sourceModule || "finance",
        sourceDocument: body.source_document || body.sourceDocument || "manual_journal",
        sourceDocumentId: body.source_document_id || body.sourceDocumentId || null,
        description: body.description || null,
        currencyCode: required(
          body.currency_code || body.currencyCode || body.currency,
          "currency_code"
        ).toUpperCase(),
        exchangeRate: positiveNumber(
          body.exchange_rate ?? body.exchangeRate,
          "exchange_rate"
        ),
        lines: body.lines || [],
        createdBy: actorId,
        idempotencyKey,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error.message || "Journal creation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
