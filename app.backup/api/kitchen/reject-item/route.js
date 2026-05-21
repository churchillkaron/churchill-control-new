export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  rejectKitchenItem,
} from '@/lib/kitchen/rejectKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await rejectKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        rejectedBy:
          body.rejectedBy || 'KITCHEN',

        reason:
          body.reason || 'Rejected item',

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
