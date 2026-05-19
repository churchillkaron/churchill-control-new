import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      tenant_id,
      name,
      combo_discount,
      items,
    } = body

    const {
      data: combo,
      error: comboError,
    } = await supabaseAdmin
      .from('pos_combos')
      .insert([
        {
          tenant_id,
          name,
          combo_discount,
        },
      ])
      .select()
      .single()

    if (comboError) {
      throw comboError
    }

    const comboItems =
      items.map(
        item => ({
          tenant_id,
          combo_id:
            combo.id,
          dish_id:
            item.dish_id,
        })
      )

    const {
      error:
        comboItemError,
    } = await supabaseAdmin
      .from(
        'pos_combo_items'
      )
      .insert(comboItems)

    if (
      comboItemError
    ) {
      throw comboItemError
    }

    return NextResponse.json({
      success: true,
      data: combo,
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
