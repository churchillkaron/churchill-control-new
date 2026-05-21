import { NextResponse } from 'next/server'

import { broadcastOrderUpdate } from '@/lib/pos/realtime/broadcastOrderUpdate'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const data =
      await broadcastOrderUpdate(body)

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
