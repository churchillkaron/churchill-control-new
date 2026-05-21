export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  generateKitchenEndOfDayReport,
} from '@/lib/kitchen/generateKitchenEndOfDayReport'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await generateKitchenEndOfDayReport({

        tenantId:
          body.tenantId,

        reportDate:
          body.reportDate,

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
