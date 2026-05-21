import { NextResponse } from 'next/server'

import { createVoidRequest } from '@/lib/pos/voids/createVoidRequest'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const data =
      await createVoidRequest(body)

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
