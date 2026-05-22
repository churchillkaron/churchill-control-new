import { getServiceSupabase }
from '@/lib/shared/supabase/service'

import publishEvent
from '@/lib/event-bus/core/publishEvent'

import {
  EVENTS,
} from '@/lib/shared/events/events'

import {
  registerSystemEvents,
} from '@/lib/shared/bootstrap/registerSystemEvents'

registerSystemEvents()

const supabase =
  getServiceSupabase()

export async function completeOrder({

  tenantId,

  orderId,

}) {

  if (!tenantId) {

    throw new Error(
      'tenantId required'
    )

  }

  if (!orderId) {

    throw new Error(
      'orderId required'
    )

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

  if (
    orderError ||
    !order
  ) {

    throw new Error(
      'Order not found'
    )

  }

  if (

    order.status ===
      'COMPLETED' ||

    order.production_status ===
      'COMPLETED'

  ) {

    return {

      success: true,

      alreadyCompleted: true,

      orderId,

      totalRevenue:

        Number(

          order.total_amount ||

          order.total ||

          0

        ),

      events: [],

    }

  }

  const {

    data: items,

    error: itemError,

  } = await supabase

    .from('order_items')

    .select('*')

    .eq(
      'tenant_id',
      tenantId
    )

    .eq(
      'order_id',
      orderId
    )

  if (itemError) {

    throw new Error(
      itemError.message
    )

  }

  const totalRevenue =

    (items || []).reduce(

      (sum, item) =>

        sum +

        (

          Number(
            item.price || 0
          ) *

          Number(
            item.quantity || 1
          )

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

      kitchen_status:
        'COMPLETED',

      production_status:
        'COMPLETED',

      completed_at:
        new Date()
          .toISOString(),

    })

    .eq(
      'tenant_id',
      tenantId
    )

    .eq(
      'id',
      orderId
    )

  if (updateError) {

    throw new Error(
      updateError.message
    )

  }

  const eventResults =

    await publishEvent({

      tenant_id:
        tenantId,

      event_type:
        EVENTS.ORDER_COMPLETED,

      payload: {

        tenantId,

        orderId,

        tableNumber:
          order.table_number,

        totalRevenue,

        items,

      },

    })

  return {

    success: true,

    alreadyCompleted: false,

    orderId,

    tableNumber:
      order.table_number,

    totalRevenue,

    events:
      eventResults,

  }

}
