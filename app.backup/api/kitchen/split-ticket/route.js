export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  splitKitchenTicket,
} from '@/lib/kitchen/splitKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await splitKitchenTicket({

        tenantId:
          body.tenantId,

        sourceKitchenTicketId:
          body.sourceKitchenTicketId,

        queueItemIds:
          body.queueItemIds || [],

        splitBy:
          body.splitBy || 'MANAGER',

        reason:
          body.reason || 'Split kitchen ticket',

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
