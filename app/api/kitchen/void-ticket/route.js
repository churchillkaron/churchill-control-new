export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  voidKitchenTicket,
} from '@/lib/kitchen/voidKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await voidKitchenTicket({

        tenantId:
          body.tenantId,

        kitchenTicketId:
          body.kitchenTicketId,

        voidedBy:
          body.voidedBy || 'MANAGER',

        reason:
          body.reason || 'Void kitchen ticket',

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
