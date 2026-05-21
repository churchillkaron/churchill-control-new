export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  serveKitchenItem,
} from '@/lib/kitchen/serveKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await serveKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        servedBy:
          body.servedBy || 'SERVICE',

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
