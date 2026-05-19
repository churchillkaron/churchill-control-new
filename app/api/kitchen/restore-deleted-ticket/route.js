export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  restoreDeletedKitchenTicket,
} from '@/lib/kitchen/restoreDeletedKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await restoreDeletedKitchenTicket({

        tenantId:
          body.tenantId,

        deletedTicketBackup:
          body.deletedTicketBackup,

        restoredBy:
          body.restoredBy || 'ADMIN',

        reason:
          body.reason || 'Restore deleted kitchen ticket',

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
