import { supabase } from '@/lib/shared/supabase/client'

import {
  openTableSession,
} from '@/lib/restaurant/services/openTableSession'

export async function reopenClosedOrder({
  tenantId,
  orderId,
  reopenedBy = 'SYSTEM',
  reason = 'Reopened order',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!orderId) {
    throw new Error('orderId required')
  }

  const {
    data: order,
    error: orderError,
  } = await supabase
    .from('orders')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      orderId
    )
    .single()

  if (orderError || !order) {
    throw new Error(
      'Order not found'
    )
  }

  if (
    order.status !== 'COMPLETED'
  ) {

    throw new Error(
      'Only completed orders can be reopened'
    )
  }

  await openTableSession({

    tenantId,

    tableNumber:
      order.table_number,

    openedBy:
      reopenedBy,

  })

  const {
    error: reopenError,
  } = await supabase
    .from('orders')
    .update({

      status:
        'OPEN',

      kitchen_status:
        'PENDING',

      production_status:
        'PENDING',

      payment_status:
        'UNPAID',

      reopened_by:
        reopenedBy,

      reopen_reason:
        reason,

      reopened_at:
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
      orderId
    )

  if (reopenError) {
    throw new Error(
      reopenError.message
    )
  }

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'PENDING',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_id',
      orderId
    )

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'pos',

      action:
        'REOPEN_ORDER',

      reference_id:
        orderId,

      metadata: {

        table_number:
          order.table_number,

        reopened_by:
          reopenedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderId,

    status:
      'OPEN',

  }
}
