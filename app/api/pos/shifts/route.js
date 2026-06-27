import { NextResponse } from 'next/server'

import {
  requireAuth,
} from '@/lib/shared/auth'

import {
  requireOrganizationAccess,
} from '@/lib/platform/security/requireOrganizationAccess'

import { openShift } from '@/lib/pos/shifts/openShift'

export async function POST(req) {

  try {

    const body =
      await req.json()

    await requireAuth()

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      })

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
      )

    }

    const organization_id =
      access.organizationId

    const shift =
      await openShift({

        organization_id:
          organization_id,

        staff_id:
          body.staff_id,

        staff_name:
          body.staff_name,

        role:
          body.role,

        opened_by:
          body.opened_by,
      })

    return NextResponse.json({
      success: true,
      shift,
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
