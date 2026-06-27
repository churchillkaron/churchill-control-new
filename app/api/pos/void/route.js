export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  voidOrder,
} from '@/lib/pos/voidOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await voidOrder({

        organizationId:
          body.organizationId,

        orderId:
          body.orderId,

        reason:
          body.reason || 'Void',

        voidedBy:
          body.voidedBy || 'SYSTEM',

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
