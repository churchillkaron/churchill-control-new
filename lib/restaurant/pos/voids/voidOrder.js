import { supabase } from '@/lib/shared/supabase/client'

export async function voidOrder({
  organizationId,
  orderId,
  reason = 'Void',
  voidedBy = 'SYSTEM',
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

  let restaurantTable = null;

  if (order.table_id) {
    const {
      data: table,
      error: tableError,
    } = await supabase
      .from('restaurant_tables')
      .select('id, table_number, table_name')
      .eq(
        'organization_id',
        organizationId
      )
      .eq(
        'id',
        order.table_id
      )
      .maybeSingle();

    if (tableError) {
      throw new Error(
        tableError.message
      );
    }

    restaurantTable =
      table || null;
  }

  if (
    order.payment_status === 'PAID'
  ) {

    throw new Error(
      'Cannot void paid order'
    )
  }

  if (
    order.status === 'VOIDED'
  ) {

    throw new Error(
      'Order already voided'
    )
  }

  const {
    error: voidError,
  } = await supabase
    .from('orders')
    .update({

      status:
        'VOIDED',


      production_status:
        'VOIDED',

      void_reason:
        reason,

      voided_by:
        voidedBy,

      voided_at:
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

  if (voidError) {
    throw new Error(
      voidError.message
    )
  }

  await supabase
    .from('order_items')
    .update({

      status:
        'VOIDED',

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
        'VOID_ORDER',

      reference_id:
        orderId,

      metadata: {

        table_id:
          order.table_id || null,

        table_number:
          restaurantTable?.table_number ||
          restaurantTable?.table_name ||
          null,

        total:
          order.total_amount,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderId,

    status:
      'VOIDED',

  }
}
