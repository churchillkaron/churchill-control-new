import { NextResponse } from 'next/server'

import { deductInventoryFromOrder } from '@/lib/production/deductInventoryFromOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const results =
      await deductInventoryFromOrder({
        order_items:
          body.order_items || [],
      })

    return NextResponse.json({
      success: true,
      results,
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
