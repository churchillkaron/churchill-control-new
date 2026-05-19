import { NextResponse } from 'next/server'

import { logWaste } from '@/lib/production/waste/logWaste'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await logWaste(body)

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
