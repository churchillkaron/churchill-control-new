import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url)

    const entity_id =
      searchParams.get(
        'entity_id'
      )

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_audit_logs')
      .select('*')
      .eq('entity_id', entity_id)
      .order(
        'created_at',
        {
          ascending: false,
        }
      )

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
