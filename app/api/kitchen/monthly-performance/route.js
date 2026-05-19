export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  generateKitchenMonthlyPerformance,
} from '@/lib/kitchen/generateKitchenMonthlyPerformance'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await generateKitchenMonthlyPerformance({

        tenantId:
          body.tenantId,

        month:
          body.month,

        year:
          body.year,

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
