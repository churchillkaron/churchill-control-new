import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url)

    const dish_id =
      searchParams.get('dish_id')

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('dish_modifier_groups')
      .select(`
        *,
        modifier_groups (
          id,
          name,
          required,
          multi_select,
          max_select
        )
      `)
      .eq('dish_id', dish_id)

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
