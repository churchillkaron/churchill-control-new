import { NextResponse } from 'next/server'

import { createPurchaseOrder } from '@/lib/production/purchaseOrders/createPurchaseOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await createPurchaseOrder(body)

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
