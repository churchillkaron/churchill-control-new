export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  cancelKitchenItem,
} from '@/lib/kitchen/cancelKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await cancelKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        cancelledBy:
          body.cancelledBy || 'KITCHEN',

        reason:
          body.reason || 'Cancelled item',

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
