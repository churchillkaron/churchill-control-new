import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildProfitLossSummary } from '@/lib/finance/profitLoss/buildProfitLossSummary'

export async function GET() {

  try {

    const {
      data: payments,
    } = await supabaseAdmin
      .from('payments')
      .select('*')

    const {
      data: refunds,
    } = await supabaseAdmin
      .from('pos_refunds')
      .select('*')

    const {
      data: production_costs,
    } = await supabaseAdmin
      .from(
        'production_order_costs'
      )
      .select('*')

    const {
      data: waste_logs,
    } = await supabaseAdmin
      .from(
        'production_waste_logs'
      )
      .select('*')

    const {
      data: payables,
    } = await supabaseAdmin
      .from(
        'finance_accounts_payable'
      )
      .select('*')

    const summary =
      buildProfitLossSummary({
        payments:
          payments || [],

        refunds:
          refunds || [],

        production_costs:
          production_costs || [],

        waste_logs:
          waste_logs || [],

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
