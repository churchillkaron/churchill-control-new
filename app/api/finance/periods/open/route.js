export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  openAccountingPeriodCommand,
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

    const result =
      await openAccountingPeriodCommand({
        organizationId: access.organizationId,
        entityId: body.entityId || body.entity_id || null,
        name: body.name,
        startDate: body.start_date || body.startDate,
        endDate: body.end_date || body.endDate,
        createdBy: body.createdBy || body.userId || "system",
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
