import { NextResponse } from 'next/server'

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { closeMonthEndPeriod } from '@/lib/finance/monthEnd/closeMonthEndPeriod'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const organization_id =
      access.organizationId;

    const result =
      await closeMonthEndPeriod({
        organization_id:
          organization_id,

        month:
          body.month,

        year:
          body.year,

        closed_by:
          body.closed_by,
      })

    return NextResponse.json({
      success: true,
      result,
    })

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
