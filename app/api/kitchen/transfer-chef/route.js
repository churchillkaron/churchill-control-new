export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  transferKitchenItemChef,
} from '@/lib/kitchen/transferKitchenItemChef'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await transferKitchenItemChef({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        newChefId:
          body.newChefId,

        newChefName:
          body.newChefName,

        transferredBy:
          body.transferredBy || 'CHEF_MANAGER',

        reason:
          body.reason || 'Transfer kitchen item chef',

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
