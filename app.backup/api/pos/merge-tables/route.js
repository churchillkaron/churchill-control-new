export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  mergeTables,
} from '@/lib/pos/mergeTables'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await mergeTables({

        tenantId:
          body.tenantId,

        sourceTableNumber:
          body.sourceTableNumber,

        targetTableNumber:
          body.targetTableNumber,

        mergedBy:
          body.mergedBy || 'SYSTEM',

        reason:
          body.reason || 'Table merge',

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
