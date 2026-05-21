export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  deleteKitchenTicket,
} from '@/lib/kitchen/deleteKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await deleteKitchenTicket({

        tenantId:
          body.tenantId,

        kitchenTicketId:
          body.kitchenTicketId,

        deletedBy:
          body.deletedBy || 'ADMIN',

        reason:
          body.reason || 'Delete kitchen ticket',

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
