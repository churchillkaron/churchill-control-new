import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildPOSAlerts } from '@/lib/pos/alerts/buildPOSAlerts'

export async function GET() {

  try {

    const {
      data: orders,
    } = await supabaseAdmin
      .from('orders')
      .select('*')

    const {
      data: voids,
    } = await supabaseAdmin
      .from('void_requests')
      .select('*')

    const {
      data: refunds,
    } = await supabaseAdmin
      .from('pos_refunds')
      .select('*')

    const alerts =
      buildPOSAlerts({
        orders:
          orders || [],
        voids:
          voids || [],
        refunds:
          refunds || [],
      })

    return NextResponse.json({
      success: true,
      alerts,
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
