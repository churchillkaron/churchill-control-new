export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  mergeKitchenTickets,
} from '@/lib/kitchen/mergeKitchenTickets'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await mergeKitchenTickets({

        tenantId:
          body.tenantId,

        sourceKitchenTicketId:
          body.sourceKitchenTicketId,

        targetKitchenTicketId:
          body.targetKitchenTicketId,

        mergedBy:
          body.mergedBy || 'MANAGER',

        reason:
          body.reason || 'Merge kitchen tickets',

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
