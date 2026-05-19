export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  unassignKitchenItemChef,
} from '@/lib/kitchen/unassignKitchenItemChef'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await unassignKitchenItemChef({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        unassignedBy:
          body.unassignedBy || 'CHEF_MANAGER',

        reason:
          body.reason || 'Unassign chef',

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
