import { getServiceSupabase } from '@/lib/shared/supabase/service'

const supabase = getServiceSupabase()

export async function getActiveTableSession({
  tenantId,
  tableNumber,
}) {
  if (!tenantId || !tableNumber) {
    throw new Error('tenantId and tableNumber required')
  }

  const { data, error } = await supabase
    .from('table_sessions')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('table_number', tableNumber)
    .in('status', [
      'OPEN',
      'ACTIVE',
      'OCCUPIED',
      'ORDERING',
      'READY_FOR_PAYMENT',
      'PARTIAL',
    ])
    .order('started_at', { ascending: false })
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  return data?.[0] || null
}
