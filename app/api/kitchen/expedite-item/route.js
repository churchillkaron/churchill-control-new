export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  expediteKitchenItem,
} from '@/lib/kitchen/expediteKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await expediteKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        expeditedBy:
          body.expeditedBy || 'MANAGER',

        reason:
          body.reason || 'Expedite item',

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
