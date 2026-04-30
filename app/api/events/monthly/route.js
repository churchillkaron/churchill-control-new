import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const endOfMonth = new Date()
  endOfMonth.setMonth(endOfMonth.getMonth() + 1)
  endOfMonth.setDate(0)
  endOfMonth.setHours(23, 59, 59, 999)

  // 1. GET ALL ACTIVE EVENTS IN MONTH
  const { data: events, error: eventError } = await supabase
    .from('sales_events')
    .select('*')
    .gte('start_date', startOfMonth.toISOString())
    .lte('end_date', endOfMonth.toISOString())

  if (eventError) {
    return Response.json({ error: eventError.message }, { status: 500 })
  }

  let totalScores = {}

  // 2. LOOP EVENTS
  for (const event of events) {
    const { id } = event

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/events/leaderboard?event_id=${id}`
    )

    const data = await res.json()
    const full = data.full || []

    // 3. ACCUMULATE SCORES
    for (const row of full) {
      if (!totalScores[row.staff_id]) {
        totalScores[row.staff_id] = 0
      }

      totalScores[row.staff_id] += row.score
    }
  }

  // 4. FORMAT RESULT
  let result = Object.entries(totalScores).map(([staff_id, total_score]) => ({
    staff_id,
    total_score,
  }))

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

  // 7. SORT HIGH → LOW
  result.sort((a, b) => b.total_score - a.total_score)

  return Response.json(result)
}