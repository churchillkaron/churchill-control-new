export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  prioritizeKitchenItem,
} from '@/lib/kitchen/prioritizeKitchenItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await prioritizeKitchenItem({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        priority:
          body.priority || 'HIGH',

        prioritizedBy:
          body.prioritizedBy || 'KITCHEN',

        reason:
          body.reason || 'Priority item',

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
