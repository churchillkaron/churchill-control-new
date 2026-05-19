import { NextResponse } from 'next/server'

import { calculateVariance } from '@/lib/production/variance/calculateVariance'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      calculateVariance({
        theoretical:
          body.theoretical || [],
        actual:
          body.actual || [],
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
