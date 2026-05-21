import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      tenant_id,
      order_id,
      dish_id,
      quantity,
      price,
      modifiers = [],
    } = body

    const {
      data: orderItem,
      error: orderItemError,
    } = await supabaseAdmin
      .from('order_items')
      .insert([
        {
          tenant_id,
          order_id,
          dish_id,
          quantity,
          price,
        },
      ])
      .select()
      .single()

    if (orderItemError) {
      throw orderItemError
    }

    if (modifiers.length > 0) {

      const modifierRows =
        modifiers.map(
          modifier => ({
            tenant_id,
            order_item_id:
              orderItem.id,
            modifier_id:
              modifier.id,
            modifier_name:
              modifier.name,
            modifier_price:
              modifier.price,
          })
        )

      const {
        error:
          modifierInsertError,
      } = await supabaseAdmin
        .from(
          'order_item_modifiers'
        )
        .insert(modifierRows)

      if (
        modifierInsertError
      ) {
        throw modifierInsertError
      }
    }

    return NextResponse.json({
      success: true,
      data: orderItem,
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
