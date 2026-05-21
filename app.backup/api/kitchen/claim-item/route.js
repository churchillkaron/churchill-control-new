export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  claimKitchenItem,
} from '@/lib/kitchen/claimKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await claimKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        chefId:
          body.chefId,

        chefName:
          body.chefName,

        claimedBy:
          body.claimedBy || 'CHEF',

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
