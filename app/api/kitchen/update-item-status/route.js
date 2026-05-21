import { NextResponse } from 'next/server'

import {
  updateKitchenItemStatus,
} from '@/lib/kitchen/updateKitchenItemStatus'

export async function POST(
  request
) {

  try {

    const body =
      await request.json()

    const result =
      await updateKitchenItemStatus(
        body
      )

    return NextResponse.json(
      result
    )

  } catch (error) {

    return NextResponse.json({

      success: false,
      error:
        error.message,

    }, {
      status: 500,
    })
  }
}
