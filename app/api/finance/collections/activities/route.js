export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { recordCustomerCollectionActivityCommand } from "@/lib/finance/accounts-receivable/runtime/CustomerAccountApplicationService";

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

    const activity = await recordCustomerCollectionActivityCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: body.partyId || body.party_id,
      activity_id: body.activityId || body.activity_id,
      collection_case_id:
        body.collectionCaseId || body.collection_case_id,
      customer_invoice_id:
        body.customerInvoiceId || body.customer_invoice_id || null,
      activity_type: body.activityType || body.activity_type,
      notes: body.notes || null,
      outcome: body.outcome || null,
      follow_up_at: body.followUpAt || body.follow_up_at || null,
      promise_amount: body.promiseAmount ?? body.promise_amount ?? null,
      promise_date: body.promiseDate || body.promise_date || null,
      performed_by: access.user?.id || null,
      case_status: body.caseStatus || body.case_status || null,
      disputed: body.disputed,
      hold_reason: body.holdReason ?? body.hold_reason ?? null,
      idempotency_key:
        body.idempotencyKey ||
        body.idempotency_key ||
        request.headers.get("idempotency-key"),
    });

    return NextResponse.json({ success: true, activity });
  } catch (error) {
    const message = error?.message || "Unable to record collection activity";
    const status = /required|uuid|not found|scope|status|negative/i.test(message)
      ? 400
      : 500;
    return errorResponse(message, status);
  }
}
