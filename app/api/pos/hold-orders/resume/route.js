import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      hold_order_id,
    } = body

    const {
      data: holdOrder,
      error:
        holdError,
    } = await supabaseAdmin
      .from('pos_hold_orders')
      .update({
        status:
          'RESUMED',
        resumed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'id',
        hold_order_id
      )
      .select()
      .single()

    if (holdError) {
      throw holdError
    }

    await supabaseAdmin
      .from('orders')
      .update({
        status: 'OPEN',
      })
      .eq(
        'id',
        holdOrder.order_id
      )

    return NextResponse.json({
      success: true,
      data: holdOrder,
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
