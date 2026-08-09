export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { openCustomerCollectionCaseCommand } from "@/lib/finance/accounts-receivable/runtime/CustomerAccountApplicationService";

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

    const collectionCase = await openCustomerCollectionCaseCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: body.partyId || body.party_id,
      case_id: body.caseId || body.case_id,
      customer_invoice_id:
        body.customerInvoiceId || body.customer_invoice_id || null,
      accounts_receivable_id:
        body.accountsReceivableId || body.accounts_receivable_id || null,
      priority: body.priority || "NORMAL",
      assigned_to: body.assignedTo || body.assigned_to || null,
      promise_amount: body.promiseAmount ?? body.promise_amount ?? null,
      promise_date: body.promiseDate || body.promise_date || null,
      next_follow_up_at:
        body.nextFollowUpAt || body.next_follow_up_at || null,
      disputed: body.disputed ?? false,
      hold_reason: body.holdReason || body.hold_reason || null,
      opened_by: access.user?.id || null,
      idempotency_key:
        body.idempotencyKey ||
        body.idempotency_key ||
        request.headers.get("idempotency-key"),
      prefix: body.prefix || "COL",
    });

    return NextResponse.json({ success: true, collection_case: collectionCase });
  } catch (error) {
    const message = error?.message || "Unable to open collection case";
    const status = /required|uuid|not found|scope|priority|negative/i.test(message)
      ? 400
      : 500;
    return errorResponse(message, status);
  }
}
