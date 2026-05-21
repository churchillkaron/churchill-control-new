import { supabase } from '@/lib/shared/supabase/client'

export async function recallKitchenItem({
  tenantId,
  kitchenQueueId,
  recalledBy = 'KITCHEN',
  reason = 'Recall item',
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

  if (
    kitchenItem.status !==
    'BUMPED'
  ) {

    throw new Error(
      'Only bumped items can be recalled'
    )
  }

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'PREPARING',

      recalled_at:
        new Date().toISOString(),

      recalled_by:
        recalledBy,

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

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'PREPARING',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenItem.kitchen_ticket_id
    )

  await supabase
    .from('orders')
    .update({

      kitchen_status:
        'PREPARING',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenItem.order_id
    )

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'kitchen',

      action:
        'RECALL_KITCHEN_ITEM',

      reference_id:
        kitchenQueueId,

      metadata: {

        order_id:
          kitchenItem.order_id,

        table_number:
          kitchenItem.table_number,

        dish_name:
          kitchenItem.dish_name,

        recalled_by:
          recalledBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'PREPARING',

  }
}
