export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  completeKitchenItem,
} from '@/lib/kitchen/completeKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await completeKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        completedBy:
          body.completedBy || 'KITCHEN',

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
