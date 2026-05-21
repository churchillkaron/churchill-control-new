import { createClient } from '@supabase/supabase-js'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

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
