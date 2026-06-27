export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  applyDiscount,
} from '@/lib/pos/applyDiscount'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await applyDiscount({

        organizationId:
          body.organizationId,

        orderId:
          body.orderId,

        discountType:
          body.discountType || 'PERCENTAGE',

        discountValue:
          body.discountValue || 0,

        reason:
          body.reason || 'Discount',

        approvedBy:
          body.approvedBy || 'MANAGER',

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
