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

    const result = await reconcileIntercompanyTransactionAtomic({
      organizationId: access.organizationId,
      payload: body,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
