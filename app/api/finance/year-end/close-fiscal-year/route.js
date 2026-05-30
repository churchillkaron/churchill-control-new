import { NextResponse } from 'next/server'

import runYearEndClose from '@/lib/finance/year-end/runYearEndClose'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await runYearEndClose({
        tenant_id:
          body.tenant_id,

        fiscal_year:
          body.fiscal_year,

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
