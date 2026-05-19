import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildEndOfDayReport } from '@/lib/pos/endOfDay/buildEndOfDayReport'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      tenant_id,
      shift_id,
    } = body

    const today =
      new Date()
        .toISOString()
        .split('T')[0]

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
      data: voids,
    } = await supabaseAdmin
      .from('void_requests')
      .select('*')
      .eq(
        'status',
        'APPROVED'
      )

    const report =
      buildEndOfDayReport({
        payments:
          payments || [],
        refunds:
          refunds || [],
        voids:
          voids || [],
      })

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_end_of_day_reports')
      .insert([
        {
          tenant_id,
          shift_id,
          report_date:
            today,
          revenue:
            report.revenue,
          refunds:
            report.refundTotal,
          void_count:
            report.voidCount,
          net_revenue:
            report.netRevenue,
          payments_count:
            report.paymentsCount,
          refunds_count:
            report.refundsCount,
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      report:
        report,
      data,
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
