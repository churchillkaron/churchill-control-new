export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  updateAccountingPeriodStatusCommand,
} from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

export async function POST(request) {
  try {

    const body = await request.json();

    const access =
      await requireOrganizationAccess({
        organizationId: body.organizationId,
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

    await checkFinancePermission({
      userId: body.userId || "system",
      permissionKey: "close_period",
    });

    const result =
      await updateAccountingPeriodStatusCommand({
        organizationId: access.organizationId,
        periodId: body.periodId,
        status: body.status,
        userId: body.userId || "system",
      });

    return NextResponse.json(result);

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
