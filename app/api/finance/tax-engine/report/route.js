import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculateTaxSummary } from '@/lib/finance/tax/calculateTaxSummary'

export async function GET() {

  try {

    const {
      data: payments,
    } = await supabaseAdmin
      .from('payment_transactions')
      .select('*')

    const {
      data: payables,
    } = await supabaseAdmin
      .from(
        'finance_accounts_payable'
      )
      .select('*')

    const report =
      calculateTaxSummary({
        payments:
          payments || [],

        payables:
          payables || [],
      })

    return NextResponse.json({
      success: true,
      report,
      generated_at:
        new Date()
          .toISOString(),
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
