export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  removeOrderItem,
} from '@/lib/pos/removeOrderItem'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await removeOrderItem({

        tenantId:
          body.tenantId,

        orderItemId:
          body.orderItemId,

        removedBy:
          body.removedBy || 'SYSTEM',

        reason:
          body.reason || 'Remove order item',

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
