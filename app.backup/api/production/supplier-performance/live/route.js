import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildSupplierPerformance } from '@/lib/production/suppliers/buildSupplierPerformance'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'production_purchase_orders'
      )
      .select('*')

    if (error) {
      throw error
    }

    const metrics =
      buildSupplierPerformance({
        purchase_orders:
          data || [],
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
