import { NextResponse } from 'next/server'

import { registerTerminal } from '@/lib/pos/terminals/registerTerminal'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const data =
      await registerTerminal(body)

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
