export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  bumpKitchenItem,
} from '@/lib/kitchen/bumpKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await bumpKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        bumpedBy:
          body.bumpedBy || 'KITCHEN',

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
