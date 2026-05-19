export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

import {
  generateKitchenPsychologicalStability,
} from '@/lib/kitchen/generateKitchenPsychologicalStability'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await generateKitchenPsychologicalStability({

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
