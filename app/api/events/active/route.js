import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const now = new Date().toISOString()

  // OPTIONAL: get tenant_id if you use multi-tenant (RECOMMENDED)
  const { searchParams } = new URL(req.url)
  const tenant_id = searchParams.get('tenant_id')

  let query = supabase
    .from('sales_events')
    .select('*')
    .eq('status', 'active')
    .lte('start_date', now)
    .gte('end_date', now)
    .order('start_date', { ascending: false }) // ensures latest active wins
    .limit(1)

  // 🔒 MULTI-TENANT SAFETY
  if (tenant_id) {
    query = query.eq('tenant_id', tenant_id)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // ✅ STANDARDIZED RESPONSE (important for frontend stability)
  if (!data) {
    return Response.json({
      success: true,
      active: false,
      event: null
    })
  }

  return Response.json({
    success: true,
    active: true,
    event: data
  })
}