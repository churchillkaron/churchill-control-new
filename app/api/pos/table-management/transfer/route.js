import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      order_id,
      from_table_id,
      to_table_id,
    } = body

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('orders')
      .update({
        table_id:
          to_table_id,
      })
      .eq('id', order_id)
      .select()
      .single()

    if (error) {
      throw error
    }

    await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status: 'AVAILABLE',
      })
      .eq(
        'id',
        from_table_id
      )

    await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status: 'OCCUPIED',
      })
      .eq(
        'id',
        to_table_id
      )

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
