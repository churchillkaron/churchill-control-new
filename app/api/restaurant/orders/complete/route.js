export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  completeOrder,
} from '@/lib/restaurant/services/completeOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await completeOrder({

        tenantId:
          body.tenantId,

        orderId:
          body.orderId,

      })

    return NextResponse.json({

      success: true,

      result,

    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
