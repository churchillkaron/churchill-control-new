import { NextResponse } from 'next/server'

import { openTable } from '@/lib/pos/tables/openTable'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const data =
      await openTable(body)

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
