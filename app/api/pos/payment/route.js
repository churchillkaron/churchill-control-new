export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  createPayment,
} from '@/lib/pos/createPayment'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await createPayment({

        organizationId:
          body.organizationId,

        tableNumber:
          body.tableNumber,

        paymentMethod:
          body.paymentMethod || 'CASH',

        cashierName:
          body.cashierName || 'SYSTEM',

        paidAmount:
          body.paidAmount ?? null,

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
