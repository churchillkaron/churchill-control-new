import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildLivePOSMetrics } from '@/lib/pos/analytics/buildLivePOSMetrics'

export async function GET() {

  try {

    const {
      data: orders,
    } = await supabaseAdmin
      .from('orders')
      .select('*')

    const {
      data: payments,
    } = await supabaseAdmin
      .from('payments')
      .select('*')

    const {
      data: voids,
    } = await supabaseAdmin
      .from('void_requests')
      .select('*')

    const metrics =
      buildLivePOSMetrics({
        orders:
          orders || [],
        payments:
          payments || [],
        voids:
          voids || [],
      })

    return NextResponse.json({
      success: true,
      metrics,
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
