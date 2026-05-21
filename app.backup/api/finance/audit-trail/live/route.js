import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_audit_logs'
      )
      .select('*')
      .order(
        'created_at',
        {
          ascending: false,
        }
      )
      .limit(500)

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      logs:
        data || [],
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
