import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildVendorPriceHistory } from '@/lib/production/vendorPricing/buildVendorPriceHistory'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'production_purchase_order_items'
      )
      .select('*')
      .order(
        'created_at',
        {
          ascending: true,
        }
      )

    if (error) {
      throw error
    }

    const history =
      buildVendorPriceHistory({
        purchase_items:
          data || [],
      })

    return NextResponse.json({
      success: true,
      history,
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
