import { NextResponse } from 'next/server'

import { startProductionSession } from '@/lib/production/runtime/startProductionSession'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await startProductionSession(body)

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
