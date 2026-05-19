import { NextResponse } from 'next/server'

import { saveHoldOrder } from '@/lib/pos/holdOrders/saveHoldOrder'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const data =
      await saveHoldOrder(body)

    return NextResponse.json({
      success: true,
      data,
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
