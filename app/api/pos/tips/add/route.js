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
      .from('pos_tips')
      .insert([
        {
          tenant_id:
            body.tenant_id,
          order_id:
            body.order_id,
          amount:
            body.amount,
          payment_method:
            body.payment_method,
          created_by:
            body.created_by,
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
