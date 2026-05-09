import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {


  const { searchParams } = new URL(req.url)
  const event_id = searchParams.get('event_id')

  if (!event_id) {
    return Response.json({ error: 'Missing event_id' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // 1. GET EVENT
  const { data: event, error: eventError } = await supabase
    .from('sales_events')
    .select('*')
    .eq('id', event_id)
    .single()

  if (eventError || !event) {
    return Response.json({ error: 'Event not found' }, { status: 404 })
  }

  const { type, target_id, start_date, end_date, tenant_id } = event

  // 2. LOAD POS DATA
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select(`
      quantity,
      price,
      dish_id,
      staff_id,
      orders!inner(id, created_at, tenant_id)
    `)
    .eq('orders.tenant_id', tenant_id)
    .gte('orders.created_at', start_date)
    .lte('orders.created_at', end_date)

  if (itemsError) {
    return Response.json({ error: itemsError.message }, { status: 500 })
  }

  // 3. CALCULATE
  const scores = {}

  for (const item of items) {
    const staff = item.staff_id
    if (!staff) continue

    if (!scores[staff]) {
      scores[staff] = {
        staff_id: staff,
        value: 0,
        orders: new Set()
      }
    }

    switch (type) {
      case 'item_quantity':
        if (item.dish_id === target_id) {
          scores[staff].value += item.quantity
        }
        break

      case 'item_revenue':
        if (item.dish_id === target_id) {
          scores[staff].value += item.quantity * item.price
        }
        break

      case 'revenue':
        scores[staff].value += item.quantity * item.price
        break

      case 'orders':
        scores[staff].orders.add(item.orders.id)
        break

      case 'avg_order_value':
        scores[staff].value += item.quantity * item.price
        scores[staff].orders.add(item.orders.id)
        break

      default:
        break
    }
  }

  // 4. FINALIZE BASE RESULT
  let result = Object.values(scores).map(s => {
    if (type === 'orders') {
      s.value = s.orders.size
    }

    if (type === 'avg_order_value') {
      const count = s.orders.size || 1
      s.value = s.value / count
    }

    return {
      staff_id: s.staff_id,
      score: Math.round(s.value)
    }
  })

  // 🔥 5. LOAD STAFF NAMES (CRITICAL FIX)
  const staffIds = result.map(r => r.staff_id)

  let staffMap = {}

  if (staffIds.length > 0) {
    const { data: staffRows, error: staffError } = await supabase
      .from('staff_accounts')
      .select('id, name')
      .in('id', staffIds)

    if (!staffError && staffRows) {
      for (const s of staffRows) {
        staffMap[s.id] = s.name
      }
    }
  }

  // 🔥 6. ATTACH NAMES
  result = result.map(r => ({
    ...r,
    name: staffMap[r.staff_id] || "Unknown"
  }))

  // 7. SORT
  result.sort((a, b) => b.score - a.score)

  return Response.json({
    event,
    leaderboard: result.slice(0, 3),
    full: result
  })
}