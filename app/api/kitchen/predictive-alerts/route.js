export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  generateKitchenPredictiveAlerts,
} from '@/lib/kitchen/generateKitchenPredictiveAlerts'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await generateKitchenPredictiveAlerts({

        tenantId:
          body.tenantId,

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
