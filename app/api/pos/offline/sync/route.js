import { NextResponse } from 'next/server'

import { processOfflineOrders } from '@/lib/pos/offline/processOfflineOrders'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const results =
      await processOfflineOrders(
        body.orders || []
      )

    return NextResponse.json({
      success: true,
      synced: results.length,
      data: results,
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
