export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  refundPayment,
} from '@/lib/pos/refundPayment'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await refundPayment({

        organizationId:
          body.organizationId,

        paymentTransactionId:
          body.paymentTransactionId,

        reason:
          body.reason || 'Refund',

        refundedBy:
          body.refundedBy || 'SYSTEM',

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
