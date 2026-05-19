export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  markKitchenItemReady,
} from '@/lib/kitchen/markKitchenItemReady'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await markKitchenItemReady({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        readyBy:
          body.readyBy || 'KITCHEN',

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
