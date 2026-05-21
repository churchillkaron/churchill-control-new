export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  unarchiveKitchenTicket,
} from '@/lib/kitchen/unarchiveKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await unarchiveKitchenTicket({

        tenantId:
          body.tenantId,

        kitchenTicketId:
          body.kitchenTicketId,

        restoredBy:
          body.restoredBy || 'MANAGER',

        reason:
          body.reason || 'Restore archived kitchen ticket',

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
