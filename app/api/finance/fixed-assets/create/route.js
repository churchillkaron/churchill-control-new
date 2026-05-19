import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_fixed_assets'
      )
      .insert([
        {
          tenant_id:
            body.tenant_id,

          asset_name:
            body.asset_name,

          purchase_cost:
            body.purchase_cost,

          salvage_value:
            body.salvage_value,

          useful_life_years:
            body.useful_life_years,

          purchased_at:
            body.purchased_at,
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
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
