import { supabase } from '@/lib/shared/supabase/client'

import {
  completeKitchenTicket,
} from '@/lib/restaurant/services/completeKitchenTicket'

export async function completeKitchenItem({
  tenantId,
  kitchenQueueId,
  completedBy = 'KITCHEN',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
  }

  const {
    data: kitchenItem,
    error: kitchenItemError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenQueueId
    )
    .single()

  if (
    kitchenItemError ||
    !kitchenItem
  ) {

    throw new Error(
      'Kitchen queue item not found'
    )
  }

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'COMPLETED',

      completed_at:
        new Date().toISOString(),

      completed_by:
        completedBy,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenQueueId
    )

  /*
  |--------------------------------------------------------------------------
  | Verify Remaining Kitchen Queue
  |--------------------------------------------------------------------------
  */

  const {
    data: remainingItems,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'kitchen_ticket_id',
      kitchenItem.kitchen_ticket_id
    )
    .neq(
      'status',
      'COMPLETED'
    )

  /*
  |--------------------------------------------------------------------------
  | Complete Ticket If Finished
  |--------------------------------------------------------------------------
  */

  if (
    !remainingItems ||
    remainingItems.length === 0
  ) {

    await completeKitchenTicket({

      tenantId,

      ticketId:
        kitchenItem.kitchen_ticket_id,

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Audit
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'kitchen',

      action:
        'COMPLETE_KITCHEN_ITEM',

      reference_id:
        kitchenQueueId,

      metadata: {

        order_id:
          kitchenItem.order_id,

        table_number:
          kitchenItem.table_number,

        dish_name:
          kitchenItem.dish_name,

        completed_by:
          completedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'COMPLETED',

  }
}
