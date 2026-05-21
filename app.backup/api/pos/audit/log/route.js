import { NextResponse } from 'next/server'

import { createAuditLog } from '@/lib/pos/audit/createAuditLog'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const data =
      await createAuditLog(body)

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
