export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  moveOrderItems,
} from '@/lib/pos/moveOrderItems'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await moveOrderItems({

        organizationId:
          body.organizationId,

        sourceOrderId:
          body.sourceOrderId,

        targetOrderId:
          body.targetOrderId,

        itemIds:
          body.itemIds || [],

        movedBy:
          body.movedBy || 'SYSTEM',

        reason:
          body.reason || 'Move order items',

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
