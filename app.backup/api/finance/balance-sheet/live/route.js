import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildCashflowSummary } from '@/lib/finance/cashflow/buildCashflowSummary'

import { buildBalanceSheet } from '@/lib/finance/balanceSheet/buildBalanceSheet'

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

    const {
      data: inventory,
    } = await supabaseAdmin
      .from('ingredients')
      .select('*')

    const cashflow =
      buildCashflowSummary({
        payments:
          payments || [],

        payables:
          payables || [],
      })

    const sheet =
      buildBalanceSheet({
        cashflow,
        inventory:
          inventory || [],

        payables:
          payables || [],
      })

    return NextResponse.json({
      success: true,
      sheet,
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
