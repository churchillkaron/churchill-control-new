import { supabase } from '@/lib/shared/supabase/client'

import loadOperationalSettings
from '@/lib/settings/loadOperationalSettings'

import {
  getActiveTableSession,
} from '@/lib/restaurant/services/getActiveTableSession'

export async function mergeTables({
  tenantId,
  sourceTableNumber,
  targetTableNumber,
  mergedBy = 'SYSTEM',
  reason = 'Table merge',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!sourceTableNumber) {
    throw new Error('sourceTableNumber required')
  }

  if (!targetTableNumber) {
    throw new Error('targetTableNumber required')
  }

  const tableSettings =
    await loadOperationalSettings({

      tenantId,

      domain:
        'TABLES',

    })

  if (
    !tableSettings?.allow_table_merge
  ) {

    throw new Error(
      'Table merge disabled by settings'
    )

  }

  if (
    tableSettings?.require_manager_merge &&
    mergedBy !== 'MANAGER'
  ) {

    throw new Error(
      'Manager approval required for table merge'
    )

  }

  if (
    sourceTableNumber ===
    targetTableNumber
  ) {

    throw new Error(
      'Cannot merge same table'
    )
  }

  const sourceSession =
    await getActiveTableSession({

      tenantId,

      tableNumber:
        sourceTableNumber,

    })

  if (!sourceSession) {

    throw new Error(
      'Source session not found'
    )
  }

  const targetSession =
    await getActiveTableSession({

      tenantId,

      tableNumber:
        targetTableNumber,

    })

  if (!targetSession) {

    throw new Error(
      'Target session not found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Move Orders
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      table_number:
        targetTableNumber,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      sourceTableNumber
    )
    .neq(
      'payment_status',
      'PAID'
    )

  /*
  |--------------------------------------------------------------------------
  | Move Kitchen Tickets
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      table_number:
        targetTableNumber,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      sourceTableNumber
    )
    .neq(
      'status',
      'COMPLETED'
    )

  /*
  |--------------------------------------------------------------------------
  | Merge Revenue + Orders
  |--------------------------------------------------------------------------
  */

  const mergedRevenue =
    Number(
      targetSession.revenue || 0
    ) +
    Number(
      sourceSession.revenue || 0
    )

  const mergedOrders =
    Number(
      targetSession.orders || 0
    ) +
    Number(
      sourceSession.orders || 0
    )

  await supabase
    .from('table_sessions')
    .update({

      revenue:
        mergedRevenue,

      orders:
        mergedOrders,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      targetSession.id
    )

  /*
  |--------------------------------------------------------------------------
  | Close Source Session
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('table_sessions')
    .update({

      status:
        'MERGED',

      merged_into_session_id:
        targetSession.id,

      closed_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      sourceSession.id
    )

  /*
  |--------------------------------------------------------------------------
  | Reset Source Table
  |--------------------------------------------------------------------------
  */

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
      sourceTableNumber
    )

  /*
  |--------------------------------------------------------------------------
  | Ensure Target Table Occupied
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('restaurant_tables')
    .update({

      status:
        'OCCUPIED',

      active_session_id:
        targetSession.id,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      targetTableNumber
    )

  /*
  |--------------------------------------------------------------------------
  | Audit Log
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'pos',

      action:
        'MERGE_TABLES',

      reference_id:
        targetSession.id,

      metadata: {

        source_table:
          sourceTableNumber,

        target_table:
          targetTableNumber,

        merged_by:
          mergedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    sourceTableNumber,

    targetTableNumber,

    targetSessionId:
      targetSession.id,

    mergedRevenue,

    mergedOrders,

  }
}
