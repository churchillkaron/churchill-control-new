import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculatePrepEfficiency } from '@/lib/production/prep/capabilities/calculatePrepEfficiency'

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

    if (error) {
      throw error
    }

    const metrics =
      calculatePrepEfficiency({
        batches:
          data || [],
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
