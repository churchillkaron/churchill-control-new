import { NextResponse } from 'next/server'

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { closeAccountingPeriod } from '@/lib/finance/monthEnd/closeAccountingPeriod'

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

    const tenant_id =
      access.tenantId;

    const result =
      await closeAccountingPeriod({
        tenant_id:
          tenant_id,

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
