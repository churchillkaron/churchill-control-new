import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      organization_id,
      dish_id,
      modifier_group_id,
    } = body

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('dish_modifier_groups')
      .insert([
        {
          organization_id,
          dish_id,
          modifier_group_id,
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
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }
}
