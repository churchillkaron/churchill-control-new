import { createClient } from '@supabase/supabase-js'

import {
  emitEvent,
} from '@/lib/shared/events/eventBus'

import {
  EVENTS,
} from '@/lib/shared/events/events'

import {
  registerSystemEvents,
} from '@/lib/shared/bootstrap/registerSystemEvents'

registerSystemEvents()

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function completeOrder({
  tenantId,
  orderId,
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
    .eq('tenant_id', tenantId)
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    throw new Error('Order not found')
  }

  const {
    data: items,
    error: itemError,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)

  if (itemError) {
    throw new Error(itemError.message)
  }

  const totalRevenue =
    (items || []).reduce(
      (sum, item) =>
        sum +
        (
          Number(item.price || 0) *
          Number(item.quantity || 1)
        ),
      0
    )

  const {
    error: updateError,
  } = await supabase
    .from('orders')
    .update({

      status:
        'COMPLETED',

      completed_at:
        new Date().toISOString(),

    })
    .eq('tenant_id', tenantId)
    .eq('id', orderId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const eventResults =
    await emitEvent(

      EVENTS.ORDER_COMPLETED,

      {

        tenantId,

        orderId,

        totalRevenue,

        items,

      }
    )

  return {

    success: true,

    orderId,

    totalRevenue,

    events:
      eventResults,

  }
}
