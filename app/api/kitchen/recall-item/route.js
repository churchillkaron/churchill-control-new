export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  recallKitchenItem,
} from '@/lib/kitchen/recallKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await recallKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        recalledBy:
          body.recalledBy || 'KITCHEN',

        reason:
          body.reason || 'Recall item',

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
