import { NextResponse } from 'next/server'

import { performThreeWayMatch } from '@/lib/production/purchasing/workflows/performThreeWayMatch'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      performThreeWayMatch({
        purchase_order:
          body.purchase_order,

        received_items:
          body.received_items || [],

        invoice_items:
          body.invoice_items || [],
      })

    return NextResponse.json({
      success: true,
      result,
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
