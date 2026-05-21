import { getServiceSupabase } from '@/lib/shared/supabase/service'

const supabase = getServiceSupabase()

export async function getActiveTableSession({
  tenantId,
  tableNumber,
}) {

  if (!tenantId || !tableNumber) {

    throw new Error(
      'tenantId and tableNumber required'
    )
  }

  const {
    data,
    error,
  } = await supabase
    .from('table_sessions')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      tableNumber
    )
    .in(
      'status',
      [
        'OPEN',
        'ORDERING',
        'READY_FOR_PAYMENT',
      ]
    )
    .order(
      'started_at',
      {
        ascending: false,
      }
    )
    .limit(1)

  if (error) {
    throw new Error(error.message)
  }

  if (
    !data ||
    data.length === 0
  ) {
    return null
  }

  return data[0]
}
