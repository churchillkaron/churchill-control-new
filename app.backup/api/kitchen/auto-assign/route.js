export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  autoAssignKitchenItem,
} from '@/lib/kitchen/autoAssignKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await autoAssignKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        assignedBy:
          body.assignedBy || 'SYSTEM',

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
