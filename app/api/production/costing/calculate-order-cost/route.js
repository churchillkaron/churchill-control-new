import { NextResponse } from 'next/server'

import { calculateOrderCost } from '@/lib/production/costing/capabilities/calculateOrderCost'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await calculateOrderCost({
        order_items:
          body.order_items || [],
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
