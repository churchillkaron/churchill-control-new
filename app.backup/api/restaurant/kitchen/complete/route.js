export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  completeKitchenTicket,
} from '@/lib/restaurant/services/completeKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await completeKitchenTicket({

        tenantId:
          body.tenantId,

        ticketId:
          body.ticketId,

      })

    return NextResponse.json({

      success: true,

      result,

    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
