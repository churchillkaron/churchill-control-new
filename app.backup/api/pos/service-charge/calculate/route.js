import { NextResponse } from 'next/server'

import { calculateServiceCharge } from '@/lib/pos/serviceCharge/calculateServiceCharge'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      calculateServiceCharge({
        revenue:
          body.revenue,
        percent:
          body.percent || 5,
      })

    return NextResponse.json({
      success: true,
      result,
    })

  } catch (error) {

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
