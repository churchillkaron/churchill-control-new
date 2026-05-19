import { NextResponse } from 'next/server'

import { closeAccountingPeriod } from '@/lib/finance/monthEnd/closeAccountingPeriod'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await closeAccountingPeriod({
        tenant_id:
          body.tenant_id,

        month:
          body.month,

        year:
          body.year,

        closed_by:
          body.closed_by,
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
