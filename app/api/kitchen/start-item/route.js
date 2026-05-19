export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  startKitchenItem,
} from '@/lib/kitchen/startKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await startKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        startedBy:
          body.startedBy || 'KITCHEN',

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
