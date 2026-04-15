export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function POST(req) {
  try {
    const supabase = getSupabase()
    const body = await req.json()

    const items = Array.isArray(body.items) ? body.items : []
    const subtotal = Number(body.subtotal || 0)
    const service = Number(body.service || 0)
    const discount = Number(body.discount || 0)
    const total = Number(body.total || 0)
    const cash = Number(body.cash || 0)
    const change = Number(body.change || 0)
    const note = typeof body.note === 'string' ? body.note : ''

    if (!items.length) {
      return NextResponse.json(
        { error: 'No items in sale.' },
        { status: 400 }
      )
    }

    // 🔥 ENSURE SAFE ITEM STRUCTURE
    const safeItems = items.map((item) => ({
      name: item?.name || '',
      qty: Number(item?.qty || 0),
      price: Number(item?.price || 0),
    }))

    const { data, error } = await supabase
      .from('pos-sales')
      .insert([
        {
          items: safeItems,
          subtotal,
          service,
          discount,
          total,
          cash,
          change,
          note,
        },
      ])
      .select('id, created_at')
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      receiptId: data.id,
      createdAt: data.created_at,
    })

  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}