import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url)

    const order_id =
      searchParams.get(
        'order_id'
      )

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('order_items')
      .select(`
        *,
        order_item_modifiers (
          id,
          modifier_name,
          modifier_price
        )
      `)
      .eq('order_id', order_id)

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
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }
}
