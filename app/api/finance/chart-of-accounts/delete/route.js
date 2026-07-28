export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { deleteAccountCommand } from "@/lib/finance/chart-of-accounts/runtime/AccountApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityId = body.entityId || body.entity_id;
    if (!entityId) {
      throw new Error("entityId required");
    }

    const account = await deleteAccountCommand({
      organizationId: access.organizationId,
      entityId,
      accountId:
        body.id ||
        body.accountId ||
        body.row?.id,
    });

    return NextResponse.json({
      success: true,
      account,
      message: "Account archived.",
    });
  } catch (error) {
    const message = error.message || "Account archive failed";
    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|not found|cannot/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
