import { NextResponse } from 'next/server'

import { routeOrderItems } from '@/lib/pos/kitchen-routing/routeOrderItems'

import { buildStationQueue } from '@/lib/pos/kitchen-routing/buildStationQueue'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const routed =
      routeOrderItems(
        body.items || []
      )

    const queues =
      buildStationQueue(
        routed
      )

    return NextResponse.json({
      success: true,
      routed,
      queues,
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
