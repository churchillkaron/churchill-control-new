import { NextResponse } from 'next/server'

import { calculateTheoreticalUsage } from '@/lib/production/theoretical/calculateTheoreticalUsage'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await calculateTheoreticalUsage({
        order_items:
          body.order_items || [],
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
