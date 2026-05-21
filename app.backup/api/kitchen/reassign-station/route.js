export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  reassignKitchenItemStation,
} from '@/lib/kitchen/reassignKitchenItemStation'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await reassignKitchenItemStation({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        station:
          body.station || 'HOT',

        reassignedBy:
          body.reassignedBy || 'CHEF',

        reason:
          body.reason || 'Reassign kitchen station',

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
