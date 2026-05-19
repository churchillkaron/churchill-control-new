import { NextResponse } from 'next/server'

import { calculateYieldAnalysis } from '@/lib/production/yield/calculateYieldAnalysis'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      calculateYieldAnalysis({
        batches:
          body.batches || [],
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
