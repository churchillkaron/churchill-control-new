export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  holdKitchenItem,
} from '@/lib/kitchen/holdKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await holdKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        reason:
          body.reason || 'Hold item',

        heldBy:
          body.heldBy || 'KITCHEN',

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
