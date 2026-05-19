export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  partialPayment,
} from '@/lib/pos/partialPayment'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await partialPayment({

        tenantId:
          body.tenantId,

        tableNumber:
          body.tableNumber,

        paymentMethod:
          body.paymentMethod || 'CASH',

        amount:
          body.amount || 0,

        cashierName:
          body.cashierName || 'SYSTEM',

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
