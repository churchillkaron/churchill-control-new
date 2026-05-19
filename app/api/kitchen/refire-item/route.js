export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  refireKitchenItem,
} from '@/lib/kitchen/refireKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await refireKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        refiredBy:
          body.refiredBy || 'KITCHEN',

        reason:
          body.reason || 'Refire item',

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
