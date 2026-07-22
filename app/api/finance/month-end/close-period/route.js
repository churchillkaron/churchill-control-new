export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { runMonthEndCloseCommand } from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

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

    const result =
      await runMonthEndCloseCommand({
        ...body,
        organizationId:
          access.organizationId,
        organization_id:
          access.organizationId,
        entityId:
          body.entityId ||
          body.entity_id ||
          null,
        entity_id:
          body.entity_id ||
          body.entityId ||
          null,
        periodId:
          body.periodId ||
          body.period_id ||
          null,
        period_id:
          body.period_id ||
          body.periodId ||
          null,
      });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Month-end close failed",
      },
      {
        status: 500,
      }
    );
  }
}
