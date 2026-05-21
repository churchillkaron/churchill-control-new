export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  recallCancelledKitchenItem,
} from '@/lib/kitchen/recallCancelledKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await recallCancelledKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        recalledBy:
          body.recalledBy || 'MANAGER',

        reason:
          body.reason || 'Recall cancelled item',

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
