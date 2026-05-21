export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  sendOrderToKitchen,
} from '@/lib/pos/sendOrderToKitchen'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await sendOrderToKitchen({

        tenantId:
          body.tenantId,

        orderId:
          body.orderId,

        sentBy:
          body.sentBy || 'SYSTEM',

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
