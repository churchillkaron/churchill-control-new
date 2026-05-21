import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculateDiscount } from '@/lib/pos/discounts/calculateDiscount'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      order_id,
      subtotal,
      discount_id,
    } = body

    const {
      data: discount,
      error: discountError,
    } = await supabaseAdmin
      .from('pos_discounts')
      .select('*')
      .eq('id', discount_id)
      .single()

    if (discountError) {
      throw discountError
    }

    const result =
      calculateDiscount({
        subtotal,
        discount_type:
          discount.discount_type,
        discount_value:
          discount.discount_value,
      })

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('orders')
      .update({
        discount_id,
        discount_amount:
          result.discountAmount,
        total:
          result.finalTotal,
      })
      .eq('id', order_id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data,
      totals: result,
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
