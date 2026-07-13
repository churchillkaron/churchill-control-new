import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {
  try {
    const body = await req.json()

    const organization_id =
      body.organization_id ||
      body.organizationId

    const { data, error } = await supabaseAdmin
      .from('dishes')
      .select(`
        *,
        recipe_items (
          id,
          quantity,
          item_id,
          ingredients (
            id,
            name,
            unit,
            cost_per_unit
          )
        )
      `)
      .eq('organization_id', organization_id)
      .order('name')

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('GET RECIPES ERROR:', error)

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
