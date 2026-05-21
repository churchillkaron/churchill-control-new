export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  assignKitchenItemChef,
} from '@/lib/kitchen/assignKitchenItemChef'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await assignKitchenItemChef({

        tenantId:
          body.tenantId,

        kitchenQueueId:
          body.kitchenQueueId,

        chefId:
          body.chefId,

        chefName:
          body.chefName,

        assignedBy:
          body.assignedBy || 'CHEF_MANAGER',

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
