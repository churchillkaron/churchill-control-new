export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  updateOrderItemQuantity,
} from '@/lib/pos/updateOrderItemQuantity'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await updateOrderItemQuantity({

        organizationId:
          body.organizationId,

        orderItemId:
          body.orderItemId,

        quantity:
          body.quantity,

        updatedBy:
          body.updatedBy || 'SYSTEM',

        reason:
          body.reason || 'Update quantity',

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
