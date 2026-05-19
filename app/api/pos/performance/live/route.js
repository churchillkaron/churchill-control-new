import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildStaffPerformance } from '@/lib/pos/performance/buildStaffPerformance'

export async function GET() {

  try {

    const {
      data: orders,
    } = await supabaseAdmin
      .from('orders')
      .select('*')

    const {
      data: staff,
    } = await supabaseAdmin
      .from('staff_accounts')
      .select('*')

    const performance =
      buildStaffPerformance({
        orders:
          orders || [],
        staff:
          staff || [],
      })

    return NextResponse.json({
      success: true,
      performance,
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
