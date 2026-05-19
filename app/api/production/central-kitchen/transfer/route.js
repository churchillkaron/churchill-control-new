import { NextResponse } from 'next/server'

import { createKitchenTransfer } from '@/lib/production/centralKitchen/createKitchenTransfer'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await createKitchenTransfer(body)

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
