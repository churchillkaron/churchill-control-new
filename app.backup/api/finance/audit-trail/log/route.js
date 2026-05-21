import { NextResponse } from 'next/server'

import { createFinanceAuditLog } from '@/lib/finance/audit/createFinanceAuditLog'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await createFinanceAuditLog(body)

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
