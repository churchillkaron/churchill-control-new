export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  addOrderModifier,
} from '@/lib/pos/addOrderModifier'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await addOrderModifier({

        organizationId:
          body.organizationId,

        orderItemId:
          body.orderItemId,

        modifierName:
          body.modifierName,

        modifierPrice:
          body.modifierPrice || 0,

        quantity:
          body.quantity || 1,

        addedBy:
          body.addedBy || 'SYSTEM',

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
