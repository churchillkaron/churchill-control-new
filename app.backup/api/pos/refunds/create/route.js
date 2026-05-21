import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculateRefundAmount } from '@/lib/pos/refunds/calculateRefundAmount'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      tenant_id,
      order_id,
      refundedItems,
      orderTotal,
      requested_by,
      reason,
    } = body

    const result =
      calculateRefundAmount({
        orderTotal,
        refundedItems,
      })

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_refunds')
      .insert([
        {
          tenant_id,
          order_id,
          amount:
            result.refundAmount,
          requested_by,
          reason,
          status:
            'PENDING',
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data,
      totals: result,
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
