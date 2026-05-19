import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildStockAlerts } from '@/lib/production/alerts/buildStockAlerts'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('ingredients')
      .select('*')
      .order(
        'name'
      )

    if (error) {
      throw error
    }

    const alerts =
      buildStockAlerts(
        data || []
      )

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
