export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { upsertAccountCommand } from "@/lib/finance/chart-of-accounts/runtime/AccountApplicationService";

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

    const account = await upsertAccountCommand({
      organizationId: access.organizationId,
      entityId,
      accountId:
        body.id ||
        body.accountId ||
        null,
      values: body,
    });

    return NextResponse.json({
      success: true,
      account,
      message: body.id || body.accountId
        ? "Account updated."
        : "Account created.",
    });
  } catch (error) {
    const message = error.message || "Account save failed";
    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|not found|valid|cannot|already exists|does not match/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
