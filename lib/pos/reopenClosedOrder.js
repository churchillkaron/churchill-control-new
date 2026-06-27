import { supabase } from '@/lib/shared/supabase/client'

import {
  openTableSession,
} from '@/lib/restaurant/services/openTableSession'

export async function reopenClosedOrder({
  organizationId = null,
  orderId,
  reopenedBy = 'SYSTEM',
  reason = 'Reopened order',
}) {

  if (!organizationId) {
    throw new Error('organizationId required')
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
      'organization_id',
      organizationId
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

    organizationId,

    tableId:
      order.table_id,

    tableNumber:
      order.table_number,

  })

  const {
    error: reopenError,
  } = await supabase
    .from('orders')
    .update({

      status:
        'OPEN',


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
      'organization_id',
      organizationId
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
    .from('order_items')
    .update({

      status:
        'PENDING',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'order_id',
      orderId
    )

  await supabase
    .from('audit_logs')
    .insert({

      organization_id:
        organizationId,

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
