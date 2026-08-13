export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { createIntercompanyTransactionAtomic } from "@/lib/finance/intercompany/IntercompanyPolicy";

function failure(error) {
  const message = error?.message || "Intercompany transaction creation failed";
  const normalized = String(message).toLowerCase();
  const status = normalized.includes("permission denied")
    ? 403
    : /required|must|cannot|different|active|configured|exchange rate|currency|account|entity|exists|supported|date|idempotency/i.test(message)
      ? 400
      : 500;
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

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await createIntercompanyTransactionAtomic({
      organizationId: access.organizationId,
      payload: body,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return failure(error);
  }
}
