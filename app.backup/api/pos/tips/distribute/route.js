import { NextResponse } from 'next/server'

import { calculateTipDistribution } from '@/lib/pos/tips/calculateTipDistribution'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const distribution =
      calculateTipDistribution({
        totalTips:
          body.totalTips,
        staff:
          body.staff,
      })

    return NextResponse.json({
      success: true,
      distribution,
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
