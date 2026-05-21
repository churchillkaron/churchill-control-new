export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  archiveKitchenTicket,
} from '@/lib/kitchen/archiveKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await archiveKitchenTicket({

        tenantId:
          body.tenantId,

        kitchenTicketId:
          body.kitchenTicketId,

        archivedBy:
          body.archivedBy || 'MANAGER',

        reason:
          body.reason || 'Archive kitchen ticket',

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
