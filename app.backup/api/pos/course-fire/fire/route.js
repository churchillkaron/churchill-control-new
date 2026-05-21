import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      order_id,
      course,
    } = body

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('order_items')
      .update({
        kitchen_status:
          'FIRED',
      })
      .eq('order_id', order_id)
      .eq('course', course)
      .select()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      fired:
        data.length,
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
