export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  transferTable,
} from '@/lib/pos/transferTable'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await transferTable({

        tenantId:
          body.tenantId,

        fromTableId:
          body.fromTableId,

        toTableId:
          body.toTableId,

        transferredBy:
          body.transferredBy || 'SYSTEM',

        reason:
          body.reason || 'Table transfer',

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
