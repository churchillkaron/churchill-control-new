import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      void_request_id,
      approved_by,
    } = body

    const {
      data: voidRequest,
      error: requestError,
    } = await supabaseAdmin
      .from('void_requests')
      .update({
        status: 'APPROVED',
        approved_by,
        approved_at:
          new Date()
            .toISOString(),
      })
      .eq(
        'id',
        void_request_id
      )
      .select()
      .single()

    if (requestError) {
      throw requestError
    }

    await supabaseAdmin
      .from('order_items')
      .update({
        status: 'VOIDED',
      })
      .eq(
        'id',
        voidRequest.order_item_id
      )

    return NextResponse.json({
      success: true,
      data: voidRequest,
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
