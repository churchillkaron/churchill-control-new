import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      purchase_order_id,
    } = body

    const {
      data: items,
      error,
    } = await supabaseAdmin
      .from(
        'production_purchase_order_items'
      )
      .select('*')
      .eq(
        'purchase_order_id',
        purchase_order_id
      )

    if (error) {
      throw error
    }

    for (const item of items) {

      const {
        data: ingredient,
      } = await supabaseAdmin
        .from('ingredients')
        .select('*')
        .eq(
          'id',
          item.ingredient_id
        )
        .single()

      const newStock =
        Number(
          ingredient.stock || 0
        ) +
        Number(
          item.quantity || 0
        )

      await supabaseAdmin
        .from('ingredients')
        .update({
          stock:
            newStock,
        })
        .eq(
          'id',
          ingredient.id
        )

      await supabaseAdmin
        .from(
          'inventory_movements'
        )
        .insert([
          {
            ingredient_id:
              ingredient.id,

            movement_type:
              'PURCHASE_RECEIPT',

            quantity:
              item.quantity,

            reference_type:
              'PURCHASE_ORDER',

            reference_id:
              purchase_order_id,
          },
        ])
    }

    await supabaseAdmin
      .from(
        'production_purchase_orders'
      )
      .update({
        status:
          'RECEIVED',
      })
      .eq(
        'id',
        purchase_order_id
      )

    return NextResponse.json({
      success: true,
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
