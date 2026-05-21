import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      batch_id,
      quantity,
    } = body

    const {
      data: batch,
      error:
        batchError,
    } = await supabaseAdmin
      .from(
        'production_prep_batches'
      )
      .select('*')
      .eq(
        'id',
        batch_id
      )
      .single()

    if (batchError) {
      throw batchError
    }

    const remaining =
      Number(
        batch.remaining_quantity || 0
      ) - Number(quantity)

    const status =
      remaining <= 0
        ? 'CONSUMED'
        : 'ACTIVE'

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'production_prep_batches'
      )
      .update({
        remaining_quantity:
          remaining,
        status,
      })
      .eq(
        'id',
        batch_id
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
