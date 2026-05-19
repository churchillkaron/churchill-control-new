import { createClient } from '@supabase/supabase-js'

import {
  getActiveTableSession,
} from './getActiveTableSession'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function openTableSession({
  tenantId,
  tableNumber,
  openedBy = null,
}) {

  if (!tenantId || !tableNumber) {

    throw new Error(
      'tenantId and tableNumber required'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Verify Physical Table
  |--------------------------------------------------------------------------
  */

  const {
    data: table,
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
    .single()

  if (tableError || !table) {

    throw new Error(
      'Restaurant table not found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Prevent Double Seating
  |--------------------------------------------------------------------------
  */

  if (
    table.status === 'OCCUPIED' &&
    table.active_session_id
  ) {

    const existing =
      await getActiveTableSession({

        tenantId,

        tableNumber,

      })

    if (existing) {
      return existing
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Create Session
  |--------------------------------------------------------------------------
  */

  const session = {

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

    opened_by:
      openedBy,

    started_at:
      new Date().toISOString(),

    created_at:
      new Date().toISOString(),

  }

  const {
    data,
    error,
  } = await supabase
    .from('table_sessions')
    .insert(session)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  /*
  |--------------------------------------------------------------------------
  | Lock Physical Table
  |--------------------------------------------------------------------------
  */

  const {
    error: tableUpdateError,
  } = await supabase
    .from('restaurant_tables')
    .update({

      status:
        'OCCUPIED',

      active_session_id:
        data.id,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      tableNumber
    )

  if (tableUpdateError) {
    throw new Error(
      tableUpdateError.message
    )
  }

  return data
}
