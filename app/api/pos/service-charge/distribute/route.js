import { NextResponse } from 'next/server'

import { distributeServiceCharge } from '@/lib/pos/serviceCharge/distributeServiceCharge'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      distributeServiceCharge({
        total:
          body.total,
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
