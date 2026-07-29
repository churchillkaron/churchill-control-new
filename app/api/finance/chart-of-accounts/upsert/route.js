export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { upsertAccountCommand } from "@/lib/finance/chart-of-accounts/runtime/AccountApplicationService";

function failureStatus(message) {
  return /required|valid|select|already exists|duplicate|outside|inactive|account code|account type/i.test(
    String(message || "")
  )
    ? 400
    : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.accounting.manage",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const account = await upsertAccountCommand({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
      accountId: body.id || body.accountId || null,
      values: body,
    });

    return NextResponse.json({ success: true, account });
  } catch (error) {
    const message = error?.message || "Account could not be saved";
    return NextResponse.json(
      { success: false, error: message },
      { status: failureStatus(message) }
    );
  }
}
