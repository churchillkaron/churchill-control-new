export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  removeOrderModifier,
} from '@/lib/pos/removeOrderModifier'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await removeOrderModifier({

        organizationId:
          body.organizationId,

        modifierId:
          body.modifierId,

        removedBy:
          body.removedBy || 'SYSTEM',

        reason:
          body.reason || 'Remove modifier',

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
