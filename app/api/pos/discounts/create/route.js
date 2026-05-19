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
      .from('pos_discounts')
      .insert([
        {
          tenant_id:
            body.tenant_id,
          name:
            body.name,
          discount_type:
            body.discount_type,
          discount_value:
            body.discount_value,
          active: true,
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
