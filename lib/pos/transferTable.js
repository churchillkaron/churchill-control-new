import { supabase } from '@/lib/shared/supabase/client'

import loadOperationalSettings
from '@/lib/settings/loadOperationalSettings'

import {
  getActiveTableSession,
} from '@/lib/restaurant/services/getActiveTableSession'

export async function transferTable({
  tenantId,
  fromTableNumber,
  toTableNumber,
  transferredBy = 'SYSTEM',
  reason = 'Table transfer',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!fromTableNumber) {
    throw new Error('fromTableNumber required')
  }

  if (!toTableNumber) {
    throw new Error('toTableNumber required')
  }

  const tableSettings =
    await loadOperationalSettings({

      tenantId,

      domain:
        'TABLES',

    })

  if (
    !tableSettings?.allow_table_transfer
  ) {

    throw new Error(
      'Table transfers disabled by settings'
    )

  }

  if (
    tableSettings?.require_manager_transfer &&
    transferredBy !== 'MANAGER'
  ) {

    throw new Error(
      'Manager approval required for table transfer'
    )

  }

  if (
    fromTableNumber === toTableNumber
  ) {

    throw new Error(
      'Cannot transfer to same table'
    )
  }

  const activeSession =
    await getActiveTableSession({

      tenantId,

      tableNumber:
        fromTableNumber,

    })

  if (!activeSession) {

    throw new Error(
      'No active session found'
    )
  }

  const {
    data: destinationTable,
    error: destinationError,
  } = await supabase
    .from('restaurant_tables')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      toTableNumber
    )
    .single()

  if (
    destinationError ||
    !destinationTable
  ) {

    throw new Error(
      'Destination table not found'
    )
  }

  if (
    destinationTable.status ===
    'OCCUPIED'
  ) {

    throw new Error(
      'Destination table occupied'
    )
  }

  await supabase
    .from('orders')
    .update({

      table_number:
        toTableNumber,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      fromTableNumber
    )
    .neq(
      'payment_status',
      'PAID'
    )

  await supabase
    .from('kitchen_tickets')
    .update({

      table_number:
        toTableNumber,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      fromTableNumber
    )
    .neq(
      'status',
      'COMPLETED'
    )

  await supabase
    .from('table_sessions')
    .update({

      table_number:
        toTableNumber,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      activeSession.id
    )

  await supabase
    .from('restaurant_tables')
    .update({

      status:
        'AVAILABLE',

      active_session_id:
        null,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      fromTableNumber
    )

  await supabase
    .from('restaurant_tables')
    .update({

      status:
        'OCCUPIED',

      active_session_id:
        activeSession.id,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      toTableNumber
    )

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'pos',

      action:
        'TRANSFER_TABLE',

      reference_id:
        activeSession.id,

      metadata: {

        from_table:
          fromTableNumber,

        to_table:
          toTableNumber,

        transferred_by:
          transferredBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    sessionId:
      activeSession.id,

    fromTableNumber,

    toTableNumber,

  }
}
