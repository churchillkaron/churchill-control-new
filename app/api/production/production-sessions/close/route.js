import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      session_id,
      notes,
    } = body

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'production_sessions'
      )
      .update({
        status:
          'CLOSED',
        notes,
        closed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'id',
        session_id
      )
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      result: data,
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
