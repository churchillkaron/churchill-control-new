import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      refund_id,
      approved_by,
    } = body

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_refunds')
      .update({
        status:
          'APPROVED',
        approved_by,
        approved_at:
          new Date()
            .toISOString(),
      })
      .eq('id', refund_id)
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
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
