export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  reopenVoidedKitchenTicket,
} from '@/lib/kitchen/reopenVoidedKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await reopenVoidedKitchenTicket({

        tenantId:
          body.tenantId,

        kitchenTicketId:
          body.kitchenTicketId,

        reopenedBy:
          body.reopenedBy || 'MANAGER',

        reason:
          body.reason || 'Reopen voided ticket',

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
