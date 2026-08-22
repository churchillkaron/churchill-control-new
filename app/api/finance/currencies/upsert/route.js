export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { upsertFinanceCurrency } from "@/lib/finance/currencies/FinanceCurrencyPolicy";

function failure(error) {
  const message = error?.message || "Currency save failed";
  const status = /permission denied/i.test(message)
    ? 403
    : /required|must|cannot|not found|already|recognised|valid|configured/i.test(message)
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

    await requireFinanceWorkspacePermission({
      capabilityId: "currencies",
      operation: "write",
      access,
    });

    const currency = await upsertFinanceCurrency({
      organizationId: access.organizationId,
      payload: body,
      recordId: body.id || body.record_id || null,
      actorId: access.user?.id || null,
    });

    return NextResponse.json({
      success: true,
      currency,
      record: currency,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request) {
  return POST(request);
}
