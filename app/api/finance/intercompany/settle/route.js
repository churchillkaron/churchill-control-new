export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { settleIntercompanyTransactionAtomic } from "@/lib/finance/intercompany/IntercompanyPolicy";

function failure(error) {
  const message = error?.message || "Intercompany settlement failed";
  const status = /required|not found|must|cannot|exceeds|reconciled|already|account|rate|date|idempotency/i.test(message) ? 400 : 500;
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

    const result = await settleIntercompanyTransactionAtomic({
      organizationId: access.organizationId,
      payload: body,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
