import { supabase } from '@/lib/shared/supabase/client'

export async function moveOrderItems({
  organizationId,
  sourceOrderId,
  targetOrderId,
  itemIds = [],
  movedBy = 'SYSTEM',
  reason = 'Move order items',
}) {

  if (!organizationId) {
    throw new Error('organizationId required')
  }

  if (!sourceOrderId) {
    throw new Error('sourceOrderId required')
  }

  if (!targetOrderId) {
    throw new Error('targetOrderId required')
  }

  if (!itemIds.length) {
    throw new Error('No items selected')
  }

  const {
    data: sourceOrder,
    error: sourceError,
  } = await supabase
    .from('orders')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      sourceOrderId
    )
    .single()

  if (
    sourceError ||
    !sourceOrder
  ) {

    throw new Error(
      'Source order not found'
    )
  }

  const {
    data: targetOrder,
    error: targetError,
  } = await supabase
    .from('orders')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      targetOrderId
    )
    .single()

  if (
    targetError ||
    !targetOrder
  ) {

    throw new Error(
      'Target order not found'
    )
  }

  const {
    data: items,
    error: itemError,
  } = await supabase
    .from('order_items')
    .select('*')
    .in(
      'id',
      itemIds
    )
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'order_id',
      sourceOrderId
    )

  if (itemError) {
    throw new Error(
      itemError.message
    )
  }

  if (
    !items ||
    items.length === 0
  ) {

    throw new Error(
      'No matching order items found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Move Items
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('order_items')
    .update({

      order_id:
        targetOrderId,

      updated_at:
        new Date().toISOString(),

    })
    .in(
      'id',
      itemIds
    )
    .eq(
      'organization_id',
      organizationId
    )

  /*
  |--------------------------------------------------------------------------
  | Recalculate Totals
  |--------------------------------------------------------------------------
  */

  const {
    data: sourceItems,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'order_id',
      sourceOrderId
    )

  const {
    data: targetItems,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'order_id',
      targetOrderId
    )

  const sourceTotal =
    (sourceItems || []).reduce(
      (sum, item) =>
        sum +
        Number(item.total || 0),
      0
    )

  const targetTotal =
    (targetItems || []).reduce(
      (sum, item) =>
        sum +
        Number(item.total || 0),
      0
    )

  await supabase
    .from('orders')
    .update({

      total:
        sourceTotal,

      total_amount:
        sourceTotal,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      sourceOrderId
    )

  await supabase
    .from('orders')
    .update({

      total:
        targetTotal,

      total_amount:
        targetTotal,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      targetOrderId
    )

  /*
  |--------------------------------------------------------------------------
  | Audit
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      organization_id:
        organizationId,

      module:
        'pos',

      action:
        'MOVE_ORDER_ITEMS',

      reference_id:
        targetOrderId,

      metadata: {

        source_order_id:
          sourceOrderId,

        target_order_id:
          targetOrderId,

        item_ids:
          itemIds,

        moved_by:
          movedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    sourceOrderId,

    targetOrderId,

    movedItems:
      itemIds.length,

    sourceTotal,

    targetTotal,

  }
}
