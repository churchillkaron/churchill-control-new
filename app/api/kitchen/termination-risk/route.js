export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  generateKitchenTerminationRisk,
} from '@/lib/kitchen/generateKitchenTerminationRisk'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await generateKitchenTerminationRisk({

        tenantId:
          body.tenantId,

        startDate:
          body.startDate,

        endDate:
          body.endDate,

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
