import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildExpiryAlerts } from '@/lib/production/prepared/capabilities/buildExpiryAlerts'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'production_prep_batches'
      )
      .select('*')
      .eq(
        'status',
        'ACTIVE'
      )

    if (error) {
      throw error
    }

    const alerts =
      buildExpiryAlerts(
        data || []
      )

    return NextResponse.json({
      success: true,
      alerts,
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
