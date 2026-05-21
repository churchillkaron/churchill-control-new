export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  releaseKitchenItemClaim,
} from '@/lib/kitchen/releaseKitchenItemClaim'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await releaseKitchenItemClaim({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        releasedBy:
          body.releasedBy || 'CHEF_MANAGER',

        reason:
          body.reason || 'Release kitchen item claim',

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
