import { NextResponse } from 'next/server'

import { closeFiscalYear } from '@/lib/finance/yearEnd/closeFiscalYear'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const result =
      await closeFiscalYear({
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
