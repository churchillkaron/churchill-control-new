export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  requeueKitchenItem,
} from '@/lib/kitchen/requeueKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await requeueKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        requeuedBy:
          body.requeuedBy || 'KITCHEN',

        reason:
          body.reason || 'Requeue item',

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
