export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { reconcileIntercompanyTransactionAtomic } from "@/lib/finance/intercompany/IntercompanyPolicy";

function failure(error) {
  const message = error?.message || "Intercompany reconciliation failed";
  const status = /required|not found|must|cannot|idempotency|transaction/i.test(message) ? 400 : 500;
  return NextResponse.json({ success: false, error: message }, { status });
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

    const transactionId = body.transaction_id || body.transactionId || body.id;
    const reconciliationDate =
      body.reconciliation_date || new Date().toISOString().slice(0, 10);
    const payload = {
      ...body,
      transaction_id: transactionId,
      reconciliation_date: reconciliationDate,
      idempotency_key:
        body.idempotency_key ||
        body.idempotencyKey ||
        `intercompany:reconcile:${transactionId}:${reconciliationDate}`,
    };

    const result = await reconcileIntercompanyTransactionAtomic({
      organizationId: access.organizationId,
      payload,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
