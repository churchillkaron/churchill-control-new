import { getServiceSupabase } from '@/lib/shared/supabase/service'

import {
  getActiveTableSession,
} from './getActiveTableSession'

const supabase = getServiceSupabase()

export async function openTableSession({
  tenantId,
  tableNumber,
}) {

  if (!tenantId || !tableNumber) {

    throw new Error(
      'tenantId and tableNumber required'
    )
  }

  // ===== EXISTING SESSION =====
  const existing =
    await getActiveTableSession({

      tenantId,
      tableNumber,

    })

  if (existing) {
    return existing
  }

  // ===== FIND TABLE =====
  const {
    data: tables,
    error: tableError,
  } = await supabase

    .from('restaurant_tables')

    .select('*')

    .eq(
      'tenant_id',
      tenantId
    )

    .eq(
      'table_number',
      tableNumber
    )

    .limit(1)

  if (
    tableError ||
    !tables?.length
  ) {

    throw new Error(
      'Restaurant table not found'
    )
  }

  const table =
    tables[0]

  // ===== CREATE SESSION =====
  const {
    data,
    error,
  } = await supabase

    .from('table_sessions')

    .insert({

      tenant_id:
        tenantId,

      table_number:
        tableNumber,

      status:
        'OPEN',

      revenue:
        0,

      orders:
        0,

      started_at:
        new Date().toISOString(),

      created_at:
        new Date().toISOString(),

    })

    .select()

    .single()

  if (error) {
    throw new Error(
      error.message
    )
  }

  // ===== UPDATE TABLE =====
  await supabase

    .from('restaurant_tables')

    .update({

      status:
        'OCCUPIED',

    })

    .eq(
      'id',
      table.id
    )

  return data
}
