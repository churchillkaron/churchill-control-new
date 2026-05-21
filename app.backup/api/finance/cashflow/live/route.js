import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildCashflowSummary } from '@/lib/finance/cashflow/buildCashflowSummary'

export async function GET() {

  try {

    const {
      data: payments,
    } = await supabaseAdmin
      .from('payments')
      .select('*')

    const {
      data: payables,
    } = await supabaseAdmin
      .from(
        'finance_accounts_payable'
      )
      .select('*')

    const summary =
      buildCashflowSummary({
        payments:
          payments || [],

        payables:
          payables || [],
      })

    return NextResponse.json({
      success: true,
      summary,
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
