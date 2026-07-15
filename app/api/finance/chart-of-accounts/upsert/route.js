export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { upsertAccountCommand } from "@/lib/finance/chart-of-accounts/runtime/AccountApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId ||
          body.organization_id,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const account =
      await upsertAccountCommand({
        organizationId:
          access.organizationId,
        entityId:
          body.entityId ||
          body.entity_id ||
          null,
        accountId:
          body.id ||
          body.accountId ||
          null,
        values: body,
      });

    return NextResponse.json({
      success: true,
      account,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
