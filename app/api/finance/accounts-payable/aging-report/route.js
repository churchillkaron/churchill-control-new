import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildAccountsPayableAging } from '@/lib/finance/reports/buildAccountsPayableAging'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'accounts_payable'
      )
      .select('*')

    if (error) {
      throw error
    }

    const report =
      buildAccountsPayableAging({
        payables:
          data || [],
      })

    return NextResponse.json({
      success: true,
      report,
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
