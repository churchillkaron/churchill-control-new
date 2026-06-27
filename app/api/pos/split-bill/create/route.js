import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculateSplitTotals } from '@/lib/pos/split/calculateSplitTotals'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      organization_id,
      order_id,
      guest_name,
      items,
    } = body

    const total =
      calculateSplitTotals(
        items
      )

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('split_bills')
      .insert([
        {
          organization_id,
          order_id,
          guest_name,
          total,
          status:
            'PENDING',
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    const splitItems =
      items.map(
        item => ({
          organization_id,
          split_bill_id:
            data.id,
          order_item_id:
            item.id,
        })
      )

    const {
      error:
        splitItemError,
    } = await supabaseAdmin
      .from(
        'split_bill_items'
      )
      .insert(splitItems)

    if (
      splitItemError
    ) {
      throw splitItemError
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
