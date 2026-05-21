import { NextResponse } from 'next/server'

import { openShift } from '@/lib/pos/shifts/openShift'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const shift =
      await openShift({

        tenant_id:
          body.tenant_id,

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
