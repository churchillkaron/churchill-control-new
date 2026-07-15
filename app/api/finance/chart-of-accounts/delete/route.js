export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { deleteAccountCommand } from "@/lib/finance/chart-of-accounts/runtime/AccountApplicationService";

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
      await deleteAccountCommand({
        organizationId:
          access.organizationId,
        entityId:
          body.entityId ||
          body.entity_id ||
          null,
        accountId:
          body.id ||
          body.accountId ||
          body.row?.id,
      });

    return NextResponse.json({
      success: true,
      account,
      message: "Account deleted.",
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
