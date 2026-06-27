import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildStationLoadMetrics } from '@/lib/production/stations/capabilities/buildStationLoadMetrics'

export async function GET() {

  try {

    const {
      data: sessions,
    } = await supabaseAdmin
      .from(
        'production_sessions'
      )
      .select('*')

    const {
      data: prep_batches,
    } = await supabaseAdmin
      .from(
        'production_prep_batches'
      )
      .select('*')

    const metrics =
      buildStationLoadMetrics({
        sessions:
          sessions || [],

        prep_batches:
          prep_batches || [],
      })

    return NextResponse.json({
      success: true,
      metrics,
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
