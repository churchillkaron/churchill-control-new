import { NextResponse } from 'next/server'

import { openShift } from '@/lib/pos/shifts/openShift'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const data =
      await openShift(body)

    return NextResponse.json({
      success: true,
      data,
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
