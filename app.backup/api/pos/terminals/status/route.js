import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_terminals')
      .select('*')
      .order(
        'last_seen_at',
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
