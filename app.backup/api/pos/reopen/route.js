export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  reopenClosedOrder,
} from '@/lib/pos/reopenClosedOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await reopenClosedOrder({

        tenantId:
          body.tenantId,

        orderId:
          body.orderId,

        reopenedBy:
          body.reopenedBy || 'SYSTEM',

        reason:
          body.reason || 'Reopened order',

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
