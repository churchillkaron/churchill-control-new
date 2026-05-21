import { NextResponse } from 'next/server'

import { buildFinancialConsolidation } from '@/lib/finance/consolidation/buildFinancialConsolidation'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const consolidation =
      buildFinancialConsolidation({

        pnl:
          body.pnl || {},

        balanceSheet:
          body.balanceSheet || {},

        cashflow:
          body.cashflow || {},

        tax:
          body.tax || {},
      })

    return NextResponse.json({
      success: true,
      consolidation,
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
