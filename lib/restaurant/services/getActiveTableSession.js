import { getServiceSupabase } from '@/lib/shared/supabase/service'

const supabase = getServiceSupabase()

export async function getActiveTableSession({
  tenantId,
  tableId = null,
  tableNumber = null,
}) {
  if (!tenantId) {
    throw new Error('tenantId required')
  }

  let query = supabase
    .from('table_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', [
      'OPEN',
      'ACTIVE',
      'OCCUPIED',
      'ORDERING',
      'READY_FOR_PAYMENT',
      'PARTIAL',
    ])

  if (tableId) {
    query = query.eq('table_id', tableId)
  } else if (tableNumber) {
    query = query.eq('table_number', tableNumber)
  } else {
    throw new Error('tableId or tableNumber required')
  }

  const { data, error } = await query
    .order('started_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  return data?.[0] || null
}
