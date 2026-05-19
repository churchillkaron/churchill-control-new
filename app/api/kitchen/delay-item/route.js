export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  delayKitchenItem,
} from '@/lib/kitchen/delayKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await delayKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        delayMinutes:
          body.delayMinutes || 5,

        delayedBy:
          body.delayedBy || 'KITCHEN',

        reason:
          body.reason || 'Delayed item',

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
