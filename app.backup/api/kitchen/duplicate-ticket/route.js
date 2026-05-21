export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  duplicateKitchenTicket,
} from '@/lib/kitchen/duplicateKitchenTicket'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await duplicateKitchenTicket({

        tenantId:
          body.tenantId,

        kitchenTicketId:
          body.kitchenTicketId,

        duplicatedBy:
          body.duplicatedBy || 'MANAGER',

        reason:
          body.reason || 'Duplicate kitchen ticket',

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
