import { NextResponse } from 'next/server'

import { buildReceipt } from '@/lib/pos/receipts/buildReceipt'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const receipt =
      buildReceipt({
        order:
          body.order,

        items:
          body.items || [],

        payments:
          body.payments || [],

        cashier:
          body.cashier,

        table:
          body.table,

        guests:
          body.guests,
      })

    return NextResponse.json({
      success: true,
      receipt,
    })

  } catch (error) {

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
