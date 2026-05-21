export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  fireCourse,
} from '@/lib/kitchen/fireCourse'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await fireCourse({

        tenantId:
          body.tenantId,

        orderId:
          body.orderId,

        course:
          body.course || 'MAIN',

        firedBy:
          body.firedBy || 'SERVICE',

      })

    return NextResponse.json({

      success: true,

      result,

    })

  } catch (error) {

    console.error(error)

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
