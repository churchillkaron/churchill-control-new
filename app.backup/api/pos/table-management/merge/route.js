import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      primary_order_id,
      secondary_order_id,
    } = body

    const {
      data: secondaryItems,
      error:
        secondaryError,
    } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq(
        'order_id',
        secondary_order_id
      )

    if (secondaryError) {
      throw secondaryError
    }

    const clonedItems =
      secondaryItems.map(
        item => ({
          ...item,
          order_id:
            primary_order_id,
        })
      )

    delete clonedItems.id

    await supabaseAdmin
      .from('order_items')
      .insert(clonedItems)

    await supabaseAdmin
      .from('orders')
      .update({
        status:
          'MERGED',
      })
      .eq(
        'id',
        secondary_order_id
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
