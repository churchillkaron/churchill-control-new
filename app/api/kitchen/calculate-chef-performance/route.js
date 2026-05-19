export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  calculateKitchenChefPerformance,
} from '@/lib/kitchen/calculateKitchenChefPerformance'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await calculateKitchenChefPerformance({

        tenantId:
          body.tenantId,

        chefId:
          body.chefId,

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
