import { createServerSupabase } from "@/lib/shared/supabase/server";
export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server'



export async function POST(req) {
  try {
    const supabase = createServerSupabase()
    const body = await req.json()

    const {
      tenant_id,
      type,        // 'ingredient' | 'dish'
      item_id,
      quantity,
      reason,
      source,
      created_by
    } = body

    // 🔴 VALIDATION
    if (!tenant_id || !type || !item_id || !quantity) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    let costPerUnit = 0

    // 🧠 GET COST (ONLY INGREDIENT FOR NOW)
    if (type === 'ingredient') {
      const { data: item, error } = await supabase
        .from('ingredients')
        .select('cost')
        .eq('id', item_id)
        .single()

      if (error) throw error

      costPerUnit = item?.cost || 0
    }

    // 🔢 CALCULATE COST IMPACT
    const cost_impact = costPerUnit * quantity

    // 1. INSERT WASTE LOG
    const { data: waste, error: wasteError } = await supabase
      .from('waste_logs')
      .insert({
        tenant_id,
        type,
        item_id,
        quantity,
        reason,
        source,
        created_by,
        cost_impact,
        status: 'approved'
      })
      .select()
      .single()

    if (wasteError) throw wasteError

    // 2. UPDATE STOCK
    if (type === 'ingredient') {
      const { error: stockError } = await supabase.rpc('decrement_ingredient_stock', {
        p_item_id: item_id,
        p_quantity: quantity,
        p_tenant_id: tenant_id
      })

      if (stockError) throw stockError
    }

    if (type === 'dish') {
      const { error: stockError } = await supabase.rpc('decrement_dish_stock', {
        p_item_id: item_id,
        p_quantity: quantity,
        p_tenant_id: tenant_id
      })

      if (stockError) throw stockError
    }

    // 3. LOG STOCK MOVEMENT
    const { error: movementError } = await supabase
      .from('stock_movements')
      .insert({
        tenant_id,
        item_type: type,
        item_id,
        movement_type: 'waste',
        quantity,
        reference_id: waste.id
      })

    if (movementError) throw movementError

    return NextResponse.json({
      success: true,
      waste
    })

  } catch (err) {
    console.error('WASTE API ERROR:', err)

    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 })
  }
}